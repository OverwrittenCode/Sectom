import { type APIEmbedField, bold as _bold } from "discord.js";
import { EmbedBuilder } from "discord.js";

import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";

import type { APIEmbed, BitField } from "discord.js";

export interface BaseField extends Omit<APIEmbedField, "inline"> {}

export interface Field extends Pick<APIEmbedField, "name"> {
	value: string | BaseField[];
}

interface IndentFieldOptions {
	indentLevel?: number;
}

interface MutualField {
	data: APIEmbedField;
	indexPosition: number | "end";
}

interface BitFieldIndentFieldsOptions<T extends BitfieldIndentable> {
	fieldNames?: [added: string, removed: string];
	before: T;
	after: T;
}

type BitfieldIndentable = BitField<string, number | bigint>;

export abstract class EmbedManager {
	public static addMutualFields(embeds: EmbedBuilder[], mutualFields: MutualField[]): EmbedBuilder[] {
		return embeds.map((embed) => {
			const embedFieldLength = embed.toJSON().fields?.length;

			for (let i = 0; i < mutualFields.length; i++) {
				const { indexPosition, data } = mutualFields[i];
				const index = indexPosition === "end" ? embedFieldLength : indexPosition;

				if (!index) {
					embed.setFields([data]);
				} else {
					embed.spliceFields(index, 0, data);
				}
			}

			return embed;
		});
	}

	public static formatEmbeds(embeds: Array<EmbedBuilder | APIEmbed>): EmbedBuilder[] {
		const formattedEmbeds = embeds.map((embedLike) => {
			const embed = EmbedBuilder.from(embedLike);

			const { fields: jsonFields } = embed.toJSON();

			if (!jsonFields) {
				return embed;
			}

			const fields = jsonFields.map(({ name, value, inline }) => {
				if (!name.includes(StringUtils.fieldNameSeparator)) {
					name += StringUtils.fieldNameSeparator;
				}

				if (!name.startsWith("**")) {
					name = _bold(name);
				}

				return {
					name,
					value,
					inline
				};
			});

			embed.setFields(fields);

			return embed;
		});

		return formattedEmbeds;
	}

	public static indentFieldValues(fields: Field[], options: IndentFieldOptions = {}): string {
		const { indentLevel = 1 } = options;

		const tab = StringUtils.tabCharacter.repeat(indentLevel);

		const seperator = StringUtils.fieldNameSeparator + " ";

		return fields
			.map((field) => {
				const seperatedFieldName = field.name + seperator;
				const formattedFieldName = _bold(seperatedFieldName);

				if (typeof field.value === "string") {
					return tab + formattedFieldName + field.value;
				} else {
					const newOptions = {
						indentLevel: indentLevel * 2,
						seperator: seperator.slice(0, -1)
					};

					const subFields = field.value as Field[];

					const subFieldString: string = this.indentFieldValues(subFields, newOptions);

					return tab + formattedFieldName + StringUtils.lineBreak + subFieldString;
				}
			})
			.join(StringUtils.lineBreak);
	}

	public static convertBitFieldToIndentableFields<T extends BitfieldIndentable>(
		options: BitFieldIndentFieldsOptions<T>
	): BaseField[] {
		const { fieldNames = ["Added", "Removed"] } = options;

		const granted = options.before.missing(options.after);
		const revoked = options.after.missing(options.before);

		const result: BaseField[] = fieldNames
			.map((name, i) => ({
				name,
				value: (i === 0 ? granted : revoked).join(", ")
			}))
			.filter(({ value }) => !!value);

		return result;
	}

	public static convertObjectToIndentedFieldValues(obj: Record<string, any>, indentLevel: number = 0): string {
		if (indentLevel > 6) {
			throw new RangeError("Maximum depth reached", { cause: obj });
		}

		const indent = StringUtils.tabCharacter.repeat(indentLevel);

		const nextIndentLevel = indentLevel + 1;

		const entries = ObjectUtils.entries(obj);

		let result = "";

		for (const [key, value] of entries) {
			const property = indentLevel <= 1 ? _bold(StringUtils.convertToTitleCase(key)) : key;

			if (value == null) {
				continue;
			}

			if (result) {
				result += StringUtils.lineBreak;
			}

			result += indent + property;

			if (ObjectUtils.isValidArray(value)) {
				const isObjectArr = value.every((v) => ObjectUtils.isValidObject(v));

				if (isObjectArr) {
					result += `: ${StringUtils.lineBreak}`;

					result += value
						.map((v) => this.convertObjectToIndentedFieldValues(v, nextIndentLevel))
						.join(StringUtils.lineBreak);
				} else {
					const arrayStr = value.map((v) => `${v}`).join(", ");

					result += `: ${arrayStr}`;
				}
			} else if (ObjectUtils.isValidObject(value)) {
				result += `:${StringUtils.lineBreak + this.convertObjectToIndentedFieldValues(value, nextIndentLevel) + StringUtils.lineBreak}`;
			} else {
				result += `: ${value}`;
			}
		}

		return result.trimEnd();
	}
}
