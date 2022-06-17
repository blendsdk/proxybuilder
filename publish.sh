#!/bin/bash
git commit -am"fix: savepoint (${1:-`date`})"
git pull --rebase
git add
git push