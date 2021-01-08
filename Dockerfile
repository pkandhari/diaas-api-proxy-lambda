FROM node:8.12-alpine

RUN apk add --update git bash openssh curl

RUN npm --unsafe-perm install -g aws-sdk
