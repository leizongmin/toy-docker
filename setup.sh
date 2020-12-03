#!/usr/bin/env bash

# 配置tocker网桥
ip link del tocker0
ip link add name tocker0 type bridge
ip link set tocker0 up
ip addr add 172.15.0.1/16 dev tocker0

# 设置IP转发
echo 1 > /proc/sys/net/ipv4/ip_forward

# 将源地址为172.15.0.0/16并且不是tocker0网卡发出的数据进行源地址转换
# iptables -F && iptables -X
iptables -t nat -A POSTROUTING -o tocker0 -j MASQUERADE
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables -t nat -L -n
