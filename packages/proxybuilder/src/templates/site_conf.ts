export interface ITemplateSite {
    domain: string;
    proxyFolder: string;
    logFolder: string;
    temporary: boolean;
    sslFolder: string;
}
export const TemplateSite = ({
    domain,
    proxyFolder,
    logFolder,
    sslFolder,
    temporary
}: ITemplateSite) => {
    const tempSSL = `
        ssl_certificate ${sslFolder}/self-ssl.crt;
        ssl_certificate_key ${sslFolder}/self-ssl.key;
    `.trim();

    const ssl = `
        ssl_certificate ${sslFolder}/live/${domain}/fullchain.pem;
        ssl_certificate_key ${sslFolder}/live/${domain}/privkey.pem;
        ssl_trusted_certificate ${sslFolder}/live/${domain}/chain.pem;
    `.trim();
    return `
server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;

        server_name .${domain};

        # SSL
        ${temporary ? tempSSL : ssl}

        location / {
          default_type text/plain;
          return 200 'Hello ${domain}!';
        }

        include ${proxyFolder}/security.conf;
        include ${proxyFolder}/general.conf;
        include ${proxyFolder}/letsencrypt.conf;
}

server {

        listen 80;
        listen [::]:80;
        server_name .${domain};

        # logging
        access_log ${logFolder}/${domain}.access.log;
        error_log ${logFolder}/${domain}.error.log warn;

        # reverse proxy
        location / {
                return 301 https://${domain}$request_uri;
        }

        # additional config
        include ${proxyFolder}/general.conf;
        include ${proxyFolder}/letsencrypt.conf;
}
`.trim();
};
