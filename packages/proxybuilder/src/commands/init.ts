import { CommandBuilder } from "yargs";

/**
 * The name of this command
 */
export const command = "init";
/**
 * The description of this command
 */
export const desc = "Initialized a new proxy";
/**
 * The description of command options
 */
export const builder: CommandBuilder = {};

export const handler = (argv) => {
    console.log(process.cwd())
    console.log(argv)
};
