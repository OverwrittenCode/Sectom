import assert from "assert";

import ms from "ms";
import prettyMilliseconds from "pretty-ms";

import { NUMBER_REGEX } from "~/constants";
import { ValidationError } from "~/helpers/errors/ValidationError.js";

import type { ChatInputCommandInteraction } from "discord.js";

interface MSValidateOptions {
	min?: string;
	max?: string;
}

export function DurationTransformer(options?: MSValidateOptions) {
	return function (duration: string | undefined, interaction: ChatInputCommandInteraction): number | undefined {
		assert(interaction.inCachedGuild());

		if (!duration) {
			return;
		}

		const isOnlyDigits = NUMBER_REGEX.test(duration);
		const msDuration = ms(isOnlyDigits ? `${duration}s` : duration);

		const isInvalidDuration = isNaN(msDuration);

		if (isInvalidDuration) {
			throw new ValidationError("invalid timeout duration provided, please check your input");
		}

		const minDurationMs = ms(options?.min ?? "0s");
		const maxDurationMs = options?.max ? ms(options.max) : undefined;

		let isInvalidRange = msDuration < minDurationMs;

		if (maxDurationMs) {
			isInvalidRange ||= msDuration > maxDurationMs;
		}

		if (isInvalidRange) {
			const minVerbose = minDurationMs === 0 ? "0 seconds" : prettyMilliseconds(minDurationMs, { verbose: true });
			const maxVerbose = maxDurationMs ? prettyMilliseconds(maxDurationMs, { verbose: true }) : undefined;

			const disallowedRange = `less than ${minVerbose}${maxVerbose ? ` or more than ${maxVerbose}` : ""}`;

			throw new ValidationError(`duration cannot be ${disallowedRange}`);
		}

		return msDuration;
	};
}
