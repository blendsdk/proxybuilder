import fs from "fs";
import mkdirp from "mkdirp";
import path from "path";
import shelljs from "shelljs";
import { fileExists, folderExists, logWarn, wrapInArray } from "./lib";
import { TemplateGeneralConf } from "./templates/general_conf";
import { TemplateLetsEncryptConf } from "./templates/letsencrypt_conf";
import { TemplateNginxConf } from "./templates/nginx_conf";
import { TemplateSecurityConf } from "./templates/security_conf";
import { TemplateSite } from "./templates/site_conf";

export class ProxyBuilder {
    protected targetFolder: string;
    protected nginxFolder: string;
    protected sslFolder: string;
    protected proxyFolder: string;
    protected sitesFolder:string;
    protected logsFolder:string;
    protected varLetsEncryptFolder:string;

    public constructor(targetFolder: string) {
        this.targetFolder = targetFolder;
    }

    protected initFolder(folder: string | string[], root?: boolean) {
        const fldr = root
            ? path.resolve(...wrapInArray<string>(folder))
            : path.resolve(this.targetFolder, ...wrapInArray<string>(folder));
        if (!folderExists(fldr)) {
            mkdirp.sync(fldr);
        }
        return fldr;
    }

    protected createDhParam() {
        const dhparamFile = path.join(this.targetFolder, "dhparam.pem");
        if (!fileExists(dhparamFile)) {
            shelljs.exec(`openssl dhparam -out ${dhparamFile} 2048`);
        }
        return dhparamFile;
    }

    protected createSSLCertificate() {
        if (!fileExists(path.join(this.sslFolder, "self-ssl.key"))) {
            shelljs.exec(
                `openssl req -batch -x509 -nodes -days 365 -newkey rsa:2048 -keyout ${this.sslFolder}/self-ssl.key -out ${this.sslFolder}/self-ssl.crt`
            );
        }
    }

    protected init() {
        this.targetFolder = this.initFolder(this.targetFolder, true);
        this.nginxFolder = this.initFolder("nginx");
        this.proxyFolder = this.initFolder(["proxy"]);
        this.sslFolder = this.initFolder(["ssl"]);

        this.createSSLCertificate();

        fs.writeFileSync(
            path.join(this.nginxFolder, "nginx.conf"),
            TemplateNginxConf({
                dhparamFile: this.createDhParam(),
                modulesEnabled: this.initFolder([this.nginxFolder, "modules-enabled"]),
                logsFolder: this.logsFolder =  this.initFolder(["var", "logs"]),
                confDFolder: this.initFolder([this.nginxFolder, "conf.d"]),
                sitesEnabled: this.sitesFolder = this.initFolder([this.nginxFolder, "sites-enabled"])
            })
        );

        fs.writeFileSync(path.join(this.proxyFolder, "general.conf"), TemplateGeneralConf());
        fs.writeFileSync(path.join(this.proxyFolder, "security.conf"), TemplateSecurityConf());
        fs.writeFileSync(
            path.join(this.proxyFolder, "letsencrypt.conf"),
            TemplateLetsEncryptConf(this.varLetsEncryptFolder =  this.initFolder(["var", "letsencrypt"]))
        );
    }

    public create(domain: string) {
        this.init();
        const mainConf = path.join(this.sitesFolder,`${domain}.conf`);
        if(!fileExists(mainConf)) {
            fs.writeFileSync(mainConf,TemplateSite({
                domain:domain,
                logFolder:this.logsFolder,
                proxyFolder:this.proxyFolder,
                sslFolder:this.sslFolder,
                temporary:true
           }))
           shelljs.exec("nginx -s reload");
           shelljs.exec(
               [
                   //
                   "/usr/bin/certbot",
                   "certonly",
                   process.env.DEBUG ? "--test-cert" : " ",
                   "--webroot",
                   `-d ${domain}`,
                   `--work-dir ${this.varLetsEncryptFolder}/lib`,
                   `--logs-dir ${this.logsFolder}`,
                   `--config-dir ${this.sslFolder}`,
                   "--keep-until-expiring",
                   "-n",
                   "--agree-tos",
                   `--webroot-path ${this.varLetsEncryptFolder}`,
                   `-m info@truesoftware.nl`,
                   `--expand`
               ].join(" ")
           );
        } else {
            logWarn(`Domain ${domain} already exists!`)
        }
    }
}
