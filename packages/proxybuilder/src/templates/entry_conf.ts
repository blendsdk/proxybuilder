export interface ITemplateEntry {
    domain: string;
    proxyFolder: string;
}
export const TemplateEntry = ({ domain, proxyFolder }: ITemplateEntry) => {
    return `
        # location / {
        #    proxy_pass http://<SOME IP>:8080;
        #    ${proxyFolder}/proxy.conf;
        # }

        location / {
          default_type application/json;
          return 200 '{"welcome_to":"${domain}"}';
        }
`.trim();
};
