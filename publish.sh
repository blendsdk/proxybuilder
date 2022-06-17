#!/bin/bash
git add . && git commit -am"fix: savepoint (${1:-`date`})"
yarn tag-version-auto --yes