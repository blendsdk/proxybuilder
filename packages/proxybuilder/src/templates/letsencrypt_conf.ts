import { ITargetFolder } from "../types";

export const TemplateLetsEncryptConf = ({ targetFolder }: ITargetFolder) => {
    return `
# ACME-challenge
location ^~ /.well-known/acme-challenge/ {
    root ${targetFolder}/var/www/_letsencrypt;
}
    `.trim();
};
