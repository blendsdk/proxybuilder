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
        type: "string",
        description: "Target folder to install the files",
        default: "proxybuilder"
    },
    d: {
        alias: "domain",
        required: true,
        type: "string",
        description: "Domain to be added to the proxy"
    },
    x: {
        alias: "staging",
        required: false,
        type: "boolean",
        description: "Use LetEncrypt staging"
    }
};

export const handler = (argv:any) => {
    const builder = new ProxyBuilder(argv.target,argv.staging ? true : false)
    builder.create(argv.domain)
};
