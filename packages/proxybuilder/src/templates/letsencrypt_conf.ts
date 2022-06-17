
export const TemplateLetsEncryptConf = (wwwFolder:string) => {
    return `
# ACME-challenge
location ^~ /.well-known/acme-challenge/ {
    root ${wwwFolder};
}
    `.trim();
};
