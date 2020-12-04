#!/usr/bin/env jssh

// Docker镜像源地址
const registryMirror = __env.TOCKER_REGISTRY_MIRROR || "https://y73hag4a.mirror.aliyuncs.com";
// 数据根目录
const tockerRoot = path.abs(__env.TOCKER_DATA_PATH || path.join(__homedir, ".tocker"));
// 镜像本地存储目录
const imageDataPath = path.join(tockerRoot, "images");
// 容器本地存储目录
const containerDataPath = path.join(tockerRoot, "containers");
// cgroups限制分组
const cgroups = "cpu,cpuacct,memory";

cli.subcommand("pull", cmdPull);
cli.subcommand("images", cmdImages);
cli.subcommand("rm", cmdRm);
cli.subcommand("rmi", cmdRmi);
cli.subcommand("ps", cmdPs);
cli.subcommand("run", cmdRun);
cli.subcommand("exec", cmdExec);
cli.subcommand("logs", cmdLogs);
cli.subcommand("*", cmdHelp);
cli.subcommandstart();

function cmdHelp() {
  const N = 14;
  const rightPad = (s, len) => (s + " ".repeat(len)).slice(0, len);
  println();
  println("用法: tocker COMMAND");
  println();
  println("命令:");
  println(rightPad("  pull", N) + "从国内镜像源拉取Docker镜像");
  println(rightPad("  images", N) + "列出已下载到本地的镜像");
  println(rightPad("  rmi", N) + "删除指定的本地镜像");
  println(rightPad("  rm", N) + "删除指定容器");
  println(rightPad("  ps", N) + "列出所有容器");
  println(rightPad("  run", N) + "启动新容器");
  println(rightPad("  exec", N) + "在一个运行中的容器内执行指定命令");
  println(rightPad("  logs", N) + "查看指定容器的日志输出");
  println(rightPad("  help", N) + "打印本帮助信息");
  println();
}

function cmdPull() {
  const { longName, tag } = parseImageName(__args[3]);
  const fullName = getImageFullName(longName, tag);
  const { id, info, raw } = getImageManifests(longName, tag);

  const imageDir = path.join(imageDataPath, id);
  const rootfs = path.join(imageDir, "rootfs");
  exCmd(false, `mkdir -p "${rootfs}"`);

  const tmpTar = path.join(imageDataPath, `tmp_${id}.tar`);
  info.fsLayers.forEach((item) => {
    const url = `${registryMirror}/v2/${longName}/blobs/${item.blobSum}`;
    exCmd(false, `curl -L -o "${tmpTar}" "${url}"`);
    exCmd(false, `tar -xf "${tmpTar}" -C "${rootfs}"`);
  });
  exCmd(false, `rm -f "${tmpTar}"`);
  fs.writefile(path.join(imageDir, "img.source"), fullName);
  fs.writefile(path.join(imageDir, "img.manifests"), raw);
  log.info(`已成功拉取镜像${fullName}`);
}

function cmdImages() {
  const images = loadLocalImages();
  const list = Object.keys(images)
    .map((n) => ({ ...images[n], id: n }))
    .sort((a, b) => a.time - b.time);

  println("ID\t\t\t\t\t\t\t\t\t修改时间\t\t完整名称");
  println("-".repeat(120));
  list.forEach((item) => {
    println("%s\t%s\t%s", item.id, formatdate("Y-m-d H:i:s", item.time), item.fullName);
  });
}

function cmdRmi() {
  const name = __args[3];
  const imageInfo = findImage(name);
  if (imageInfo) {
    exCmd(true, `rm -rf "${imageInfo.path}"`);
    return log.info(`已删除镜像${name}`);
  }
  return log.fatal(`镜像${name}不存在`);
}

function cmdRun() {
  const imageName = __args[3];
  const cmd = __args[4];

  const imageInfo = findImage(imageName);
  if (!imageInfo) {
    return log.fatal(`镜像${imageName}不存在`);
  }
  const imageManifests = JSON.parse(fs.readfile(path.join(imageInfo.path, "img.manifests")));
  const imageConfig = JSON.parse(
    (imageManifests.history && imageManifests.history[0] && imageManifests.history[0].v1Compatibility) || "{}",
  ).config;
  const imageRootfs = path.join(imageInfo.path, "rootfs");

  const id = randomstring(8).toLowerCase();
  const dir = path.join(containerDataPath, id);
  const rootfs = path.join(dir, "rootfs");
  const mountDir = path.join(dir, "mount");
  const workDir = path.join(dir, "work");
  exCmd(false, `mkdir -p "${dir}"`);
  fs.writefile(path.join(dir, "image.json"), JSON.stringify(imageInfo));

  // 挂载虚拟文件系统
  exCmd(false, `mkdir -p "${rootfs}"`);
  exCmd(false, `mkdir -p "${mountDir}"`);
  exCmd(false, `mkdir -p "${workDir}"`);
  exCmd(
    false,
    `mount -t overlay -o lowerdir="${imageRootfs}",upperdir="${rootfs}",workdir="${workDir}" "tocker_${id}" "${mountDir}"`,
  );

  if (imageConfig && imageConfig.Volumes) {
    Object.keys(imageConfig.Volumes).forEach((n) => {
      exCmd(false, `mkdir -p "${rootfs}${n}"`);
    });
  }

  // 配置虚拟网络
  const ip = `${parseInt(Math.random() * 254, 10) + 1}.${parseInt(Math.random() * 254, 10) + 1}`;
  exCmd(false, `ip link add dev veth0_${id} type veth peer name veth1_${id}`);
  exCmd(false, `ip link set dev veth0_${id} up`);
  exCmd(false, `ip link set veth0_${id} master tocker0`);
  exCmd(false, `ip netns add netns_${id}`);
  exCmd(false, `ip link set veth1_${id} netns netns_${id}`);
  exCmd(false, `ip netns exec netns_${id} ip link set dev lo up`);
  // exCmd(false, `ip netns exec netns_${id} ip link set veth1_${id} address 02:42:ac:11:00"${mac}"`);
  exCmd(false, `ip netns exec netns_${id} ip addr add 172.15.${ip}/16 dev veth1_${id}`);
  exCmd(false, `ip netns exec netns_${id} ip link set dev veth1_${id} up`);
  exCmd(false, `ip netns exec netns_${id} ip route add default via 172.15.0.1`);
  exCmd(false, `ip netns exec netns_${id} hostname "${id}"`);

  // cgroups启动程序
  exCmd(false, `cgcreate -g "${cgroups}:/${id}"`);
  exCmd(false, `cgset -r cpu.shares="512" "${id}"`);
  exCmd(false, `cgset -r memory.limit_in_bytes="${512 * 1000000}" "${id}"`);
  exCmd(false, `mkdir -p "${mountDir}/etc"`);
  exCmd(false, `echo "nameserver 114.114.114.114" > "${mountDir}/etc/resolv.conf"`);
  const cgCmd = [
    `cgexec -g "${cgroups}:${id}"`,
    `ip netns exec netns_${id}`,
    `unshare -fmuip --mount-proc`,
    `/usr/bin/env -i`,
  ];
  if (__env.TERM) cgCmd.push(`TERM=${__env.TERM}`);
  if (imageConfig.Env) imageConfig.Env.forEach((line) => cgCmd.push(line));
  cgCmd.push(`chroot "${mountDir}"`);

  // 进入之后启动的命令
  let entryCmd = cmd;
  if (!entryCmd) {
    if (imageConfig.Cmd) {
      entryCmd = imageConfig.Cmd.join(" ");
    } else {
      log.fatal("缺少入口命令");
    }
  }
  if (fs.exist(path.join(mountDir, "bin", "sh"))) {
    const entryFile = path.join(mountDir, ".tocker-entry.sh");
    fs.writefile(entryFile, `/bin/mount -t proc proc /proc && ${entryCmd}`);
    exCmd(false, `chmod +x "${entryFile}"`);
    cgCmd.push(`sh /.tocker-entry.sh`);
  } else {
    cgCmd.push(entryCmd);
  }

  const finalCmd = cgCmd.join(" ");
  log.info(`RUN: ${finalCmd}`);
  pty(finalCmd);
}

function cmdPs() {
  const containers = loadContainers().sort((a, b) => a.time - b.time);
  println("ID\t\t状态\tPID\t创建时间\t\t镜像");
  println("-".repeat(120));
  containers.forEach((item) => {
    println(
      "%s\t%s\t%s\t%s\t%s",
      item.id || "",
      item.active ? "运行中" : "已停止",
      item.pid || "-",
      formatdate("Y-m-d H:i:s", item.time),
      item.image.fullName,
    );
  });
}

function cmdExec() {
  const id = cli.get(1);
  const cmd = cli.args().slice(2).join(" ");
  if (!id || !cmd) return log.fatal(`用法：tocker exec <container_id> <cmd> [...args]`);

  const container = loadContainers().find((c) => c.id === id);
  if (!container) return log.fatal(`容器${id}不存在`);
  if (!container.active || !container.pid) return log.fatal(`容器${id}已停止运行`);
  const mountDir = path.join(container.dir, "mount");

  const finalCmd = `nsenter -t "${container.pid}" -m -u -i -n -p chroot "${mountDir}" ${cmd}`;
  log.info(`RUN: ${finalCmd}`);
  pty(finalCmd);
}

function cmdLogs() {}

function cmdRm() {
  const id = cli.get(1);
  if (!id) return log.fatal(`用法：tocker rm <container_id>`);

  const container = loadContainers().find((c) => c.id === id);
  if (!container) return log.fatal(`容器${id}不存在`);
  if (container.active) return log.fatal(`容器${id}正在运行，不能删除`);

  // 删除虚拟网络配置
  exCmd(false, `ip link del dev veth0_${container.id}`);
  exCmd(false, `ip netns del netns_${container.id}`);
  // 删除cgroups命名空间
  exCmd(false, `cgdelete -g "${cgroups}:${id}"`);
  // 删除所有文件
  exCmd(false, `umount "${path.join(container.dir, "mount")}"`);
  exCmd(false, `rm -rf "${container.dir}"`);
}

function exCmd(quiet, cmd, env = {}) {
  log.info(`RUN: ${cmd}`);
  return quiet ? exec1(cmd, env) : exec2(cmd, env);
}

function getImageManifests(longName, tag) {
  const url = `${registryMirror}/v2/${longName}/manifests/${tag}`;
  const res = http.request("GET", url);
  if (res.status !== 200) {
    log.fatal(`无法获取镜像元数据：status ${res.status}: ${res.body}`);
  }
  const info = JSON.parse(res.body);
  const id = (res.headers["docker-content-digest"] || "").replace("sha256:", "");
  if (!id) {
    log.fatal(`无法获取镜像元数据：无法获取docker-content-digest响应头`);
  }
  return { id, info, raw: res.body };
}

function getImageFullName(longName, tag) {
  return `${longName}:${tag}`;
}

function parseImageName(image) {
  if (!image) return log.fatal("用法: tocker pull IMAGE");
  const name = image.split(":")[0];
  const tag = image.split(":")[1] || "latest";
  const longName = getImageLongName(name);
  return { longName, tag };
}

function getImageLongName(name) {
  return name.includes("/") ? name : `library/${name}`;
}

function loadLocalImages() {
  const images = {};
  fs.readdir(imageDataPath)
    .filter((s) => s.isdir)
    .map((s) => ({ id: s.name, path: path.join(imageDataPath, s.name), time: s.modtime }))
    .forEach((item) => {
      const imgSource = path.join(item.path, "img.source");
      if (fs.exist(imgSource)) {
        const fullName = fs.readfile(imgSource);
        item.fullName = fullName;
        images[item.id] = item;
      } else {
        // 如果目录内不存在img.source文件，则认为格式有异常，自动清理
        exCmd(true, `rm -rf "${item.path}"`);
      }
    });
  return images;
}

function findImage(name) {
  const { longName, tag } = parseImageName(name);
  const images = loadLocalImages();
  return Object.keys(images)
    .map((id) => images[id])
    .find((item) => item.id === name || item.fullName === getImageFullName(longName, tag));
}

function loadContainers() {
  return fs
    .readdir(containerDataPath)
    .map((s) => {
      const dir = path.join(containerDataPath, s.name);
      if (!s.isdir) {
        return exCmd(false, `rm -rf "${dir}"`);
      }
      const imageMetaFile = path.join(dir, "image.json");
      if (!fs.exist(imageMetaFile)) {
        exCmd(false, `umount "${path.join(dir, "mount")}"`);
        return exCmd(false, `rm -rf "${dir}"`);
      }
      const image = JSON.parse(fs.readfile(imageMetaFile));
      const id = s.name;
      const line =
        exec1(`ps o pid,cmd`)
          .output.trim()
          .split("\n")
          .filter((line) => line.includes("unshare"))
          .filter((line) => line.includes(dir))[0] || "";
      const pid = line.trim().split(" ", 2)[0];
      return { id, pid, active: !!pid, time: s.time, image, dir };
    })
    .filter((c) => c && c.image);
}
