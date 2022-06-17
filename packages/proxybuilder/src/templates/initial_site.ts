export interface ITemplateInitialSite {
    domain: string;
    proxyFolder: string;
}
export const TemplateInitialSite = ({ domain, proxyFolder }: ITemplateInitialSite) => {
    return `
server {

        listen 80;
        listen [::]:80;
        server_name .${domain};

        location / {
          default_type text/plain;
          return 200 'Hello ${domain}!';
        }

        # additional config
        include ${proxyFolder}/general.conf;
        include ${proxyFolder}/letsencrypt.conf;
}
`.trim();
};
