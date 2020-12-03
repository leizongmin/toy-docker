#!/usr/bin/env jssh

// Docker镜像源地址
const registryMirror = __env.TOCKER_REGISTRY_MIRROR || "https://y73hag4a.mirror.aliyuncs.com";
// 数据根目录
const tockerRoot = path.abs(__env.TOCKER_DATA_PATH || path.join(__homedir, ".tocker"));
// 镜像本地存储目录
const imageDataPath = path.join(tockerRoot, "images");
// 容器本地存储目录
const containerDataPath = path.join(tockerRoot, "containers");

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
  const fsRoot = path.join(imageDir, "root");
  exCmd(false, `mkdir -p "${fsRoot}"`);

  const tmpTar = path.join(imageDataPath, `tmp_${id}.tar`);
  info.fsLayers.forEach((item) => {
    const url = `${registryMirror}/v2/${longName}/blobs/${item.blobSum}`;
    exCmd(false, `curl -L -o "${tmpTar}" "${url}"`);
    exCmd(false, `tar -xf "${tmpTar}" -C "${fsRoot}"`);
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
  const raw = __args[3];
  const { longName, tag } = parseImageName(raw);
  const images = loadLocalImages();
  const img = Object.keys(images)
    .map((id) => images[id])
    .find((item) => item.id === raw || item.fullName === getImageFullName(longName, tag));
  if (img) {
    exCmd(true, `rm -rf "${img.path}"`);
    return log.info(`已删除镜像${raw}`);
  }
  return log.fatal(`镜像${raw}不存在`);
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

function generateRandomId() {
  return formatdate("YmdHis") + randomstring(12, "0123456789ABCDEF");
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
