# toy-docker
写一个玩具Docker玩玩，参考了 [bocker](https://github.com/p8952/bocker)。

## 配置

说明：在 CentOS Linux release 8.2.2004 上验证通过。

1. 安装 cgroups 命令行工具，如 `yum install -y libcgroup-tools` 或 `apt install cgroup-tools`；
2. 安装 [jssh](https://github.com/leizongmin/jssh) 用于执行 JS 脚本；
3. 链接 tocker.js 命令：`ln -s $(pwd)/tocker.js /usr/local/bin/tocker`。

## 基本使用方法

- 拉取镜像：`tocker pull centos`；
- 启动容器：`tocker run centos`（不会自动拉取镜像，需要手动执行`tocker pull`）；
- 列出所有容器：`tocker ps`；
- 列出所有本地镜像：`tocker images`；
- 删除已结束的容器：`tocker rm $id`；
- 删除本地镜像：`tocker rmi $id`；

## License

```
MIT License

Copyright (c) 2020 Zongmin Lei <leizongmin@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
