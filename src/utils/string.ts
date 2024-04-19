import crypto from "node:crypto";

import type { Typings } from "~/ts/Typings.js";

export abstract class StringUtils {
	public static isValidString(str: any): str is string {
		return !!str && typeof str === "string";
	}
	public static capitalizeFirstLetter<const T extends string>(str: T): Typings.TitleCase<T> {
		const value = str.charAt(0).toUpperCase() + str.slice(1);
		return value as Typings.TitleCase<T>;
	}

	public static concatenate<const T extends string[]>(...strs: T): Typings.Concatenate<T> {
		let result = "";
		for (let i = 0; i < strs.length; i++) {
			result += strs[i];
			if (i < strs.length - 1 && strs[i] !== "") {
				result += " ";
			}
		}
		return result as Typings.Concatenate<T>;
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
