import { CommandBuilder } from "yargs";
import { ProxyBuilder } from "../builder";

/**
 * The name of this command
 */
export const command = "create";
/**
 * The description of this command
 */
export const desc = "Initialized a new proxy";
/**
 * The description of command options
 */
export const builder: CommandBuilder = {
    t: {
        alias: "target",
        required: true,
        type: "string",
        description: "Target folder to install the files"
    },
    d: {
        alias: "domain",
        required: true,
        type: "string",
        description: "Domain to be added to the proxy"
    }
};

export const handler = (argv:any) => {

    const builder = new ProxyBuilder(argv.target)
    builder.create(argv.domain)

    // const targetFolder = path.resolve(argv.target);
    // const proxyIoFolder = path.join(targetFolder, "proxy.io");
    // const selfSignedSSLFolder = path.join(targetFolder,"var","ssl")

    // mkdirp.sync(targetFolder);
    // mkdirp.sync(path.join(targetFolder, "modules-enabled"));
    // mkdirp.sync(path.join(targetFolder, "log"));
    // mkdirp.sync(path.join(targetFolder, "conf.d"));
    // mkdirp.sync(path.join(targetFolder, "var", "www", "_letsencrypt"));
    // mkdirp.sync(path.join(selfSignedSSLFolder));
    // mkdirp.sync(path.join(targetFolder, "sites-enabled"));
    // mkdirp.sync(proxyIoFolder);

    // const dhparamFile = path.join(targetFolder, "dhparam.pem");

    // if (!fileExists(dhparamFile)) {
    //     shelljs.exec(`openssl dhparam -out ${dhparamFile} 2048`);
    // } else {
    //     logWarn("dhparam.pem already exists!", { dhparamFile });
    // }

    // const selfSignedSSL = path.join(selfSignedSSLFolder,"ssl.key");
    // if(!fileExists(selfSignedSSL)) {
    //     shelljs.exec(
    //         `openssl req -batch -x509 -nodes -days 365 -newkey rsa:2048 -keyout ${selfSignedSSLFolder}/ssl.key -out ${selfSignedSSLFolder}/ssl.crt`
    //     );
    // }

    // const nginxConfig = path.join(targetFolder, "nginx.conf");
    // fs.writeFileSync(nginxConfig, TemplateNginxConf({ targetFolder }));

    // const generalConf = path.join(proxyIoFolder, "general.conf");
    // fs.writeFileSync(generalConf, TemplateGeneralConf());

    // const securityConf = path.join(proxyIoFolder, "security.conf");
    // fs.writeFileSync(securityConf, TemplateSecurityConf());

    // const letsencryptConf = path.join(proxyIoFolder, "letsencrypt.conf");
    // fs.writeFileSync(letsencryptConf, TemplateLetsEncryptConf({targetFolder}));

};
