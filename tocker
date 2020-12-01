#!/usr/bin/env jssh

// Docker镜像源地址
const registryMirror = __env.TOCKER_REGISTRY_MIRROR || "https://y73hag4a.mirror.aliyuncs.com";
// 数据根目录
const tockerRoot = path.abs(__env.TOCKER_DATA_PATH || path.join(__homedir, ".tocker"));
// 镜像本地存储目录
const imageDataPath = path.join(tockerRoot, "images");

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
  const { fullName, tag } = parseImageName(__args[3]);

  const url = `${registryMirror}/v2/${fullName}/manifests/${tag}`;
  const { code, output } = exCmd(true, `curl -s -L "${url}"`);
  if (code !== 0) return log.error("无法拉取镜像元数据！");
  const manifests = JSON.parse(output);

  const uuid = generateRandomId();
  const imageDir = path.join(imageDataPath, uuid);
  const fsRoot = path.join(imageDir, "root");
  exCmd(false, `mkdir -p "${fsRoot}"`);

  const tmpTar = path.join(imageDataPath, `tmp_${uuid}.tar`);
  manifests.fsLayers.forEach((item) => {
    const url = `${registryMirror}/v2/${fullName}/blobs/${item.blobSum}`;
    exCmd(false, `curl -L -o "${tmpTar}" "${url}"`);
    exCmd(false, `tar -xf "${tmpTar}" -C "${fsRoot}"`);
  });
  exCmd(false, `rm -f "${tmpTar}"`);
  fs.writefile(path.join(imageDir, "img.source"), getImageId(fullName, tag));
  fs.writefile(path.join(imageDir, "img.manifests"), output);
  log.info(`已成功拉取镜像${fullName}:${tag}`);
}

function cmdImages() {
  const images = loadLocalImages();
  const list = Object.keys(images)
    .map((n) => ({ ...images[n], id: n }))
    .sort((a, b) => a.time - b.time);

  println("ID\t\t\t\t修改时间\t\t完整名称");
  println("-".repeat(80));
  list.forEach((item) => {
    println("%s\t%s\t%s", item.uuid, formatdate("Y-m-d H:i:s", item.time), item.id);
  });
}

function cmdRmi() {
  const raw = __args[3];
  const { fullName, tag } = parseImageName(raw);
  const images = loadLocalImages();
  const id = getImageId(fullName, tag);
  if (images[id]) {
    exCmd(true, `rm -rf "${images[id].path}"`);
    return log.info(`已删除镜像${id}`);
  }
  const img = Object.keys(images)
    .map((id) => images[id])
    .find((item) => item.uuid === raw);
  if (img) {
    exCmd(true, `rm -rf "${img.path}"`);
    return log.info(`已删除镜像${id}`);
  }
  return log.fatal(`镜像${id}不存在`);
}

function cmdRun() {}

function cmdPs() {}

function cmdExec() {}

function cmdLogs() {}

function cmdRm() {}

function exCmd(quiet, cmd, env = {}) {
  log.info(`RUN: ${cmd}`);
  return quiet ? exec1(cmd, env) : exec2(cmd, env);
}

function generateRandomId() {
  return formatdate("YmdHis") + randomstring(12, "0123456789ABCDEF");
}

function getImageId(fullName, tag) {
  return `${fullName}:${tag}`;
}

function parseImageName(image) {
  if (!image) return log.fatal("用法: tocker pull IMAGE");
  const name = image.split(":")[0];
  const tag = image.split(":")[1] || "latest";
  const fullName = getImageFullName(name);
  return { fullName, tag };
}

function getImageFullName(name) {
  return name.includes("/") ? name : `library/${name}`;
}

function loadLocalImages() {
  const images = {};
  fs.readdir(imageDataPath)
    .filter((s) => s.isdir)
    .map((s) => ({ uuid: s.name, path: path.join(imageDataPath, s.name), time: s.modtime }))
    .forEach((item) => {
      const imgSource = path.join(item.path, "img.source");
      if (fs.exist(imgSource)) {
        const info = fs.readfile(imgSource);
        if (images[info]) {
          const old = images[info].time;
          if (old.time < item.time) {
            exCmd(true, `rm -rf "${old.path}"`);
            images[info] = item;
          } else {
            exCmd(true, `rm -rf "${item.path}"`);
          }
        } else {
          images[info] = item;
        }
      } else {
        exCmd(true, `rm -rf "${item.path}"`);
      }
    });
  return images;
}
