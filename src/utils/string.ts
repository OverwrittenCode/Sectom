import crypto from "node:crypto";

import type { Typings } from "~/ts/Typings.js";

export abstract class StringUtils {
	public static isValidString(str: any): str is string {
		return !!str && typeof str === "string";
	}

	public static capitaliseFirstLetter<const T extends string>(str: T): Typings.SentenceCase<T> {
		const value = str.charAt(0).toUpperCase() + str.slice(1);
		return value as Typings.SentenceCase<T>;
	}

	public static concatenate<const Seperator extends string, const T extends string[]>(
		seperator: Seperator,
		...strs: T
	): Typings.Concatenate<T, Seperator> {
		let result = "";
		for (let i = 0; i < strs.length; i++) {
			result += strs[i];
			if (i < strs.length - 1 && strs[i] !== "") {
				result += seperator;
			}
		}
		return result as Typings.Concatenate<T, Seperator>;
	}

	public static GenerateID(len: number | Buffer = 16, buf?: Buffer): string {
		if (Buffer.isBuffer(len)) {
			buf = len;
			len = 0;
		}

		if (!Buffer.isBuffer(buf)) {
			const numBytes = Math.ceil(Math.log(Math.pow(64, len)) / Math.log(2) / 8);
			buf = crypto.randomBytes(numBytes);
		}

		return buf.toString("hex").slice(0, len);
	}
}
