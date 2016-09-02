#!/bin/sh

docker build --pull -t simple-swf:ci .
docker run --rm simple-swf:ci bash -c 'npm run test'
