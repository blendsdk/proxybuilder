# Nginx Proxy Builder

This is a tiny project that is meant to build and configure a Nginx proxy server on an Ubuntu server.

## How To

### 1. Update your Ubuntu system and install the required packages
```
sudo apt-get update -y && sudo apt-get upgrade -y && sudo apt-get install apt-transport-https ca-certificates curl gnupg-agent software-properties-common wget mc nginx -y
```

### 2. Setup the firewall
```
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable && ufw status
```

### 3. Create the `proxyserver` on your machine
```
adduser proxyserver
```

### 4. Switch to the `proxyserver` user
```
su -l proxyserver
```

### 5. Install NVM
```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
```

### 1. Then logout/login again
```
CTRL-D
su -l proxyserver
```

### 1. Install Node
```
nvm install --lts && nvm use --lts && npm install --global yarn
```

### 1. Setup repository
```
Copy the .npmrc and .yarnrc from the git repository
vi ~/.yarnrc
vi ~/.npmrc
```

### 1. Install @proxy/proxy
```
npm install -g @truesoftware/proxybuilder
```


