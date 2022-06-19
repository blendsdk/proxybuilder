import { CommandBuilder } from "yargs";
import { ProxyBuilder } from "../builder";

/**
 * The name of this command
 */
export const command = "renew";
/**
 * The description of this command
 */
export const desc = "Renews an existing certificate";
/**
 * The description of command options
 */
export const builder: CommandBuilder = {
    t: {
        alias: "target",
        type: "string",
        required: false,
        description: "Target folder to install the files",
        default: "/opt/proxybuilder"
    },
    d: {
        alias: "domain",
        type: "array",
        description: "Domain(s) to be added to the proxy",
        default: []
    },
    x: {
        alias: "staging",
        required: false,
        type: "boolean",
        description: "Use LetEncrypt staging"
    }
};

export const handler = (argv: any) => {
    const builder = new ProxyBuilder(argv.target, argv.staging ? true : false);
    builder.renew(argv.domain);
};
