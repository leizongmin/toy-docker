#!/usr/bin/env bash

if [ $TMPDIR ]; then
  cd $TMPDIR
else
  cd /tmp
fi

version=0.2

install_osx_version()
{
  echo "Installing macOS x64 version..."
  curl -O -L https://cdn.itoutiao.co/jssh/v$version/jssh-osx.tar.gz && \
  tar -xvf jssh-osx.tar.gz && \
  cp jssh /usr/local/bin/jssh && \
  chmod +x /usr/local/bin/jssh
  echo "Done!"
  jssh
}

install_linux_version()
{
  echo "Installing Linux x64 version..."
  curl -O -L https://cdn.itoutiao.co/jssh/v$version/jssh-linux.tar.gz && \
  tar -xvf jssh-linux.tar.gz && \
  sudo cp jssh /usr/local/bin/jssh && \
  sudo chmod +x /usr/local/bin/jssh
  echo "Done!"
  jssh
}

if [ "$(uname)" == "Darwin" ]; then
  install_osx_version
elif [ "$(uname)" == "Linux" ]; then
  install_linux_version
else
  echo "Sorry, your OS does not supported currently."
fi
