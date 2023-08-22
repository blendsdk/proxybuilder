# Nginx Proxy Builder

This is a tiny project that is meant to build and configure a Nginx proxy server on an Ubuntu server.

## How To

### 1. Update your Ubuntu system and install the required packages
```
sudo apt-get update -y && sudo apt-get upgrade -y && sudo apt-get install apt-transport-https ca-certificates curl gnupg-agent software-properties-common wget mc nginx snapd -y
```

### 2. Install Certbot
```
sudo snap install --classic certbot
```

```
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 3. Setup the firewall
```
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable && ufw status
```

### 4. Create the `proxyserver` on your machine
```
useradd -m -s $SHELL proxybuilder
```

### 5. Switch to the `proxyserver` user
```
su -l proxybuilder
```

### 6. Install NVM
```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
```

### 7. Then logout/login again
```
CTRL-D
su -l proxybuilder
```

### 8. Install Node
```
nvm install --lts && nvm use --lts && npm install -g npm@latest && npm install -g yarn
```

### 9. Setup repository
```
Copy the .npmrc and .yarnrc from the git repository
vi ~/.yarnrc
vi ~/.npmrc
```

### 10. Install @proxy/proxy
```
npm install -g @truesoftware/proxybuilder
```


