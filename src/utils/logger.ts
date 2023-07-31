import chalk from "chalk";
import winston from "winston";

const myFormat = winston.format.printf(
	({ level, message, timestamp, ...metadata }) => {
		let colour;
		switch (level) {
			case "error":
				colour = chalk.red;
				break;
			case "warn":
				colour = chalk.yellow;
				break;
			case "info":
				colour = chalk.blue;
				break;
			case "debug":
				colour = chalk.dim;
				break;
			case "verbose":
				colour = chalk.magenta;
				break;
			case "silly":
				colour = chalk.cyan;
				break;
			default:
				colour = chalk.white;
		}
		let output = colour(`[START OF ${level.toUpperCase()}]\n${message}`);
		if (Object.keys(metadata).length > 0) {
			output += `\n${JSON.stringify(metadata, null, 2)}`;
		}
		output += `\n${colour(timestamp)}\n${colour(
			`[END OF ${level.toUpperCase()}]`
		)}`;
		return output;
	}
);

export const logger = winston.createLogger({
	level: "info",
	format: winston.format.combine(winston.format.timestamp(), myFormat),
	transports: [new winston.transports.Console()]
});

// Example usage
logger.info("Hi", { meantToBe: "AnObject" });
