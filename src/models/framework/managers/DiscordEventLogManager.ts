import assert from "assert";

import { type ActionType, EventType } from "@prisma/client";
import {
	ActionRowBuilder,
	Base,
	BitField,
	CategoryChannel,
	Colors,
	DataManager,
	DiscordAPIError,
	EmbedBuilder,
	Guild,
	RESTJSONErrorCodes,
	TimestampStyles,
	WebhookClient,
	time
} from "discord.js";
import { Collection } from "discord.js";
import _ from "lodash";
import prettyMilliseconds from "pretty-ms";

import { LIGHT_GOLD } from "~/constants.js";
import { InteractionUtils } from "~/helpers/utils/interaction.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import type { LogChannelRetrieveMatchingOptions } from "~/models/DB/prisma/extensions/logChannel.js";
import { ActionManager } from "~/models/framework/managers/ActionManager.js";
import { DBConnectionManager } from "~/models/framework/managers/DBConnectionManager.js";
import type { Field } from "~/models/framework/managers/EmbedManager.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";

import type { APIEmbed, APIEmbedField, BaseChannel, ButtonBuilder, If, Snowflake } from "discord.js";
import type { Awaitable } from "discordx";
import type { UnionToIntersection } from "type-fest";

export interface BaseEventLogOptions<T extends ModifierOptionsType = ModifierOptionsType> {
	embeds: EmbedBuilder[];
	button?: ButtonBuilder;
	actionType: Extract<ActionType, `DISCORD_${string}_${T}`>;
}

interface FeatOptions<T> extends BaseEventLogOptions<FeatModifierOptionsType> {
	clazz: T;
	options: FeatOptionOptions<T>;
}

interface UpdateOptions<T> extends BaseEventLogOptions<ModifierOptionsType.UPDATE> {
	old: T;
	new: T;
	options: UpdateOptionOptions<T>;
}

interface BaseUpdateOptionOptions {
	name?: string;
}

interface FieldValueBasedEventLogOptionOptions extends BaseUpdateOptionOptions {
	fieldValue: string | null;
}

interface TransformerBasedEventLogOptionOptions<T, Class> extends BaseUpdateOptionOptions {
	transformer: Typings.SetNullableCase<
		T extends any[] ? string[] : unknown extends T ? string | string[] : string,
		T extends NonNullable<T> ? true : false
	> extends infer Return
		? (value: T, clazz: Class) => Awaitable<Return>
		: never;
}

interface CollectionFieldBasedEventLogOptionOptions<T> extends BaseUpdateOptionOptions {
	focusedKey: keyof T;
}

interface DiscriminatorBasedUpdateOptionOptions<T> extends BaseUpdateOptionOptions {
	discriminator: keyof T;
}

interface IndentFieldBasedUpdateOptionOptions extends BaseUpdateOptionOptions {
	fields: Field[];
}

interface SendLogOptions
	extends Omit<LogChannelRetrieveMatchingOptions, "eventType" | "input">,
		Pick<BaseEventLogOptions, "button"> {
	input: Record<string, any>;
	embeds: APIEmbed[];
}

type Enum = Record<number, string>;

type OmitKeys = keyof Base | "createdTimestamp" | "partial" | `${string}${"At"}` | `${"edit" | "ban"}able`;

export type MutualEventLogOptionOptions<T> = {
	[K in keyof UnionToIntersection<DistributedMutualEventLogOptionOptions<T>>]?: GetMutualOptionOptions<
		UnionToIntersection<DistributedMutualEventLogOptionOptions<T>>[K] extends infer U
			? U extends GetFnMutualEventLogOptionOptions<infer Value, T>
				? Value
				: never
			: never,
		T
	>;
};

type FeatOptionOptions<T> = {
	[K in keyof UnionToIntersection<DistributedFeatOptionOptions<T>>]?: GetFeatOptionOptions<
		UnionToIntersection<DistributedFeatOptionOptions<T>>[K] extends infer U
			? U extends GetFnFeatOptionOptions<infer Value, T>
				? Value
				: never
			: never,
		T
	>;
};

type UpdateOptionOptions<T> = {
	[K in keyof UnionToIntersection<DistributedUpdateOptionOptions<T>>]?: GetUpdateOptionOptions<
		UnionToIntersection<DistributedUpdateOptionOptions<T>>[K] extends infer U
			? U extends GetFnUpdateOptionOptions<infer Value, T>
				? Value
				: never
			: never,
		T
	>;
};

type DistributedMutualEventLogOptionOptions<T, Class = T> = T extends T
	? {
			[K in keyof Omit<T, OmitKeys> as T[K] extends Function
				? never
				: T[K] extends Record<string, any>[]
					? never
					: K]?: GetMutualOptionOptions<T[K], Class>;
		}
	: never;

type DistributedFeatOptionOptions<T, Class = T> = T extends T
	? {
			[K in keyof Omit<T, OmitKeys> as T[K] extends Function ? never : K]?: GetFeatOptionOptions<T[K], Class>;
		}
	: never;

type DistributedUpdateOptionOptions<T, Class = T> = T extends T
	? {
			[K in keyof Omit<T, OmitKeys> as T[K] extends Function ? never : K]?: GetUpdateOptionOptions<T[K], Class>;
		}
	: never;

type GetEnumOption<T> = NonNullable<GetValue<T>> extends string | number ? Enum : never;

type GetValue<T> =
	NonNullable<T> extends BaseChannel
		? Typings.SetNullableCase<Snowflake, T extends NonNullable<T> ? true : false>
		: T;

type BaseGetEventLogOptionOptions<T> = boolean | GetEnumOption<T>;

type BaseRawEventLogOptionOptions = boolean | Enum;

type GetMutualOptionOptions<T, Class> = BaseGetEventLogOptionOptions<T> | GetFnMutualEventLogOptionOptions<T, Class>;

type GetFeatOptionOptions<T, Class> = BaseGetEventLogOptionOptions<T> | GetFnFeatOptionOptions<T, Class>;

type GetUpdateOptionOptions<T, Class> = BaseGetEventLogOptionOptions<T> | GetFnUpdateOptionOptions<T, Class>;

type RawFeatOptionOptions = BaseRawEventLogOptionOptions | GetFnFeatOptionOptions<unknown, unknown, true>;

type RawUpdateOptionOptions = BaseRawEventLogOptionOptions | GetFnUpdateOptionOptions<unknown, unknown, true>;

type MutuallyExclusiveBasedUpdateOptions<T, Class, IsRaw extends boolean = false> =
	| IndentFieldBasedUpdateOptionOptions
	| Required<BaseUpdateOptionOptions>
	| GetCollectionFieldBasedEventLogOptionOptions<GetValue<T>, IsRaw>
	| TransformerBasedEventLogOptionOptions<GetValue<T>, Class>;

type GetCollectionFieldBasedEventLogOptionOptions<T, IsRaw extends boolean = false> = If<
	IsRaw,
	CollectionFieldBasedEventLogOptionOptions<Record<string, any>>,
	GetValue<T> extends Collection<string, infer Value> ? CollectionFieldBasedEventLogOptionOptions<Value> : never
>;

type GetFnMutualEventLogOptionOptions<T, Class> = () => Awaitable<
	| FieldValueBasedEventLogOptionOptions
	| Required<BaseUpdateOptionOptions>
	| TransformerBasedEventLogOptionOptions<GetValue<T>, Class>
	| GetCollectionFieldBasedEventLogOptionOptions<T>
>;

type GetFnFeatOptionOptions<T, Class, IsRaw extends boolean = false> = (
	value: GetValue<T>
) => Awaitable<
	| FieldValueBasedEventLogOptionOptions
	| Required<BaseUpdateOptionOptions>
	| TransformerBasedEventLogOptionOptions<GetValue<T>, Class>
	| GetCollectionFieldBasedEventLogOptionOptions<T, IsRaw>
>;

type GetFnUpdateOptionOptions<T, Class, IsRaw extends boolean = false> = (
	before: GetValue<T>,
	after: GetValue<T>
) => Awaitable<
	| FieldValueBasedEventLogOptionOptions
	| If<
			IsRaw,
			| DiscriminatorBasedUpdateOptionOptions<Record<string, any>>
			| MutuallyExclusiveBasedUpdateOptions<T, Class, IsRaw>,
			GetValue<T> extends (infer U extends Record<string, any>)[]
				? DiscriminatorBasedUpdateOptionOptions<U>
				: MutuallyExclusiveBasedUpdateOptions<T, Class, IsRaw>
	  >
>;

type FeatModifierOptionsType = ModifierOptionsType.CREATE | ModifierOptionsType.DELETE;

export type AbstractClazzFeatOptions<T> = Pick<FeatOptions<T>, "clazz" | "actionType">;

enum ModifierOptionsType {
	CREATE = "CREATE",
	UPDATE = "UPDATE",
	DELETE = "DELETE"
}

export abstract class DiscordEventLogManager {
	public static readonly modifierTypePastTenseMap = {
		[Enums.ModifierType.Add]: "created",
		[Enums.ModifierType.Update]: "updated",
		[Enums.ModifierType.Remove]: "deleted"
	};

	public static async updateHandler<T extends Record<string, any>>(options: UpdateOptions<T>) {
		const entries = ObjectUtils.entries<Record<string, RawUpdateOptionOptions>>(options.options);

		// Object.assign has limitations with getters/setters
		const merged = _.merge(_.clone(options.old), options.new);

		const fields: APIEmbedField[] = [];

		const embeds = options.embeds.map((embed) => embed.toJSON());

		for (const [_key, value] of entries) {
			const key = _key as string & keyof T;

			if (value === false || !(key in merged)) {
				continue;
			}

			let oldValue: unknown = options.old[key];
			let newValue: unknown = options.new[key];

			const isEqual = _.isEqualWith(oldValue, newValue, (before, after) => {
				if (before instanceof DataManager) {
					return before.cache.equals(after.cache);
				}
			});

			if (isEqual) {
				continue;
			}

			let comparator = oldValue ?? newValue;

			let fieldName: string = StringUtils.convertToTitleCase(key);
			let fieldValue: string | null = null;
			let discriminator: keyof T | null = null;
			let indentableFields: Field[] = [];

			oldValue = this.resolveClazzMention(oldValue);
			newValue = this.resolveClazzMention(newValue);

			if (typeof value === "function") {
				const result = await value(oldValue, newValue);

				if (ObjectUtils.isValidObject(result)) {
					if ("name" in result && result.name) {
						fieldName = result.name;
					}

					if ("fieldValue" in result) {
						if (result.fieldValue === null) {
							continue;
						}

						fieldValue = result.fieldValue;
					}

					if ("transformer" in result) {
						oldValue = await result.transformer(oldValue, options.old);
						newValue = await result.transformer(newValue, options.new);
					}

					if ("fields" in result) {
						indentableFields = result.fields;
					} else if ("discriminator" in result) {
						discriminator = result.discriminator as keyof T;
					} else if ("focusedKey" in result) {
						const oldVal = oldValue as Collection<string, Record<string, any>>;
						const newVal = newValue as Collection<string, Record<string, any>>;

						const key = result.focusedKey;

						oldValue = oldVal.mapValues((value) => value[key]);
						newValue = newVal.mapValues((value) => value[key]);
					}
				}
			} else if (ObjectUtils.isValidObject(value)) {
				const oldVal = oldValue as keyof typeof value;
				const newVal = newValue as keyof typeof value;

				oldValue = StringUtils.convertToTitleCase(value[oldVal]);
				newValue = StringUtils.convertToTitleCase(value[newVal]);
			}

			if (!indentableFields.length) {
				comparator = oldValue ?? newValue;

				if (comparator == null) {
					continue;
				}

				switch (true) {
					case comparator instanceof BitField:
						{
							indentableFields = EmbedManager.convertBitFieldToIndentableFields({
								before: oldValue as BitField<string>,
								after: newValue as BitField<string>
							});
						}

						break;
					case comparator instanceof DataManager:
					case comparator instanceof Collection:
						{
							const newVal = this.resolveCache(newValue);
							const oldVal = this.resolveCache(oldValue);

							const fields = [newVal, oldVal].reduce((acc, cache, i, arr) => {
								const diff = cache.subtract(arr[(i + 1) % 2]);

								if (diff.size) {
									acc.push({
										name: i === 0 ? "Added" : "Removed",
										value: diff.map((value) => `${value}`).join(", ")
									});
								}

								return acc;
							}, [] as Field[]);

							if (fields.length) {
								indentableFields = fields;
							}
						}

						break;

					case comparator instanceof Date:
						{
							if (newValue instanceof Date && !(oldValue instanceof Date)) {
								fieldValue = `Set to ${time(newValue, TimestampStyles.LongDateTime)}`;
							} else {
								indentableFields = [
									{
										name: "Before",
										value:
											oldValue instanceof Date
												? time(oldValue, TimestampStyles.LongDateTime)
												: "None"
									},
									{
										name: "After",
										value:
											newValue instanceof Date
												? time(newValue, TimestampStyles.LongDateTime)
												: "None"
									}
								];

								if (oldValue instanceof Date && newValue instanceof Date) {
									indentableFields.push({
										name: `${oldValue > newValue ? "Reduced" : "Extended"} by`,
										value: prettyMilliseconds(Math.abs(newValue.getTime() - oldValue.getTime()))
									});
								}
							}
						}

						break;
					case Array.isArray(comparator):
						{
							const isObjArr =
								comparator.length && comparator.every((value) => ObjectUtils.isValidObject(value));

							if (isObjArr) {
								assert(discriminator);

								const changes = ObjectUtils.getChangesByDiscriminator(
									oldValue as T[],
									newValue as T[],
									discriminator
								);

								fieldValue = EmbedManager.convertObjectToIndentedFieldValues(changes);
							} else {
								const changes = (newValue as unknown[]).filter(
									(value) => !(oldValue as unknown[]).includes(value)
								);

								if (changes.length) {
									fieldValue = changes.join(", ");
								}
							}
						}

						break;
					case typeof comparator === "boolean":
						{
							fieldValue = `Set to ${newValue}`;
						}

						break;
					case typeof comparator === "string":
					case typeof comparator === "number":
						{
							indentableFields = [oldValue, newValue].map((value, i) => ({
								name: i === 0 ? "Before" : "After",
								// value could be 0 which is a valid value to set
								value: this.resolveValidFieldValue(value) ?? "No value set"
							}));
						}

						break;
					default:
						throw new TypeError("Unexpected input", { cause: { key, input: comparator } });
				}
			}

			const safeValue = fieldValue?.slice(0, 1024) ?? EmbedManager.indentFieldValues(indentableFields);

			if (safeValue) {
				fields.push({
					name: fieldName,
					value: safeValue
				});
			}
		}

		if (!fields.length) {
			return;
		}

		const { actionType, button } = options;

		const baseActionTitle = actionType.replace(StringUtils.regexes.discordBasedActionLog, "");
		const imperativeTenseAction = StringUtils.convertToTitleCase(baseActionTitle, "_");

		embeds[0] = new EmbedBuilder(embeds[0])
			.setTitle(`${imperativeTenseAction}d`)
			.setColor(LIGHT_GOLD)
			.addFields(fields)
			.setTimestamp()
			.toJSON();

		await this.sendLog({
			input: options.new,
			actionType,
			embeds,
			button
		});
	}

	public static async featHandler<T extends Record<string, any>>(options: FeatOptions<T>) {
		const entries = ObjectUtils.entries<Record<string, RawFeatOptionOptions>>(options.options);

		const fields: APIEmbedField[] = [];

		const embeds = options.embeds.map((embed) => embed.toJSON());

		for (const [_key, value] of entries) {
			const key = _key as string & keyof T;

			if (value === false || !(key in options.clazz)) {
				continue;
			}

			let clazzValue: unknown = this.resolveClazzMention(options.clazz[key]);
			let fieldName: string = StringUtils.convertToTitleCase(key);
			let fieldValue: string | null = null;

			if (typeof value === "function") {
				const result = await value(clazzValue);

				if ("name" in result && result.name) {
					fieldName = result.name;
				}

				if ("fieldValue" in result) {
					const validFieldValue = this.resolveValidFieldValue(result.fieldValue);

					if (!validFieldValue) {
						continue;
					}

					fieldValue = validFieldValue;
				}

				if ("transformer" in result) {
					clazzValue = await result.transformer(clazzValue, options.clazz);
				}

				if ("focusedKey" in result) {
					clazzValue = (clazzValue as Collection<string, Record<string, any>>).mapValues(
						(value) => value[result.focusedKey]
					);
				}
			} else if (ObjectUtils.isValidObject(value)) {
				fieldValue = StringUtils.convertToTitleCase(value[clazzValue as keyof typeof value]);
			}

			if (clazzValue == null) {
				continue;
			}

			if (!fieldValue) {
				switch (true) {
					case clazzValue instanceof DataManager:
					case clazzValue instanceof Collection:
						const cache = this.resolveCache(clazzValue);

						fieldValue = Array.from(cache.values()).join(", ");

						break;

					case clazzValue instanceof Date:
						fieldValue = time(clazzValue, TimestampStyles.LongDateTime);

						break;

					case Array.isArray(clazzValue):
						fieldValue = clazzValue.join(", ");

						break;
					case typeof clazzValue === "boolean":
					case typeof clazzValue === "string":
					case typeof clazzValue === "number":
						fieldValue = clazzValue.toString();

						break;
					default:
						throw new TypeError("Unexpected input", { cause: { key, input: clazzValue } });
				}
			}

			const safeValue = fieldValue.slice(0, 1024);

			if (safeValue) {
				fields.push({
					name: fieldName,
					value: safeValue
				});
			}
		}

		assert(fields.length);

		const { actionType, button } = options;

		const colour = actionType.endsWith(ModifierOptionsType.CREATE) ? Colors.Green : Colors.Red;

		const baseActionTitle = actionType.replace(StringUtils.regexes.discordBasedActionLog, "");
		const imperativeTenseAction = StringUtils.convertToTitleCase(baseActionTitle, "_");

		embeds[0] = new EmbedBuilder(embeds[0])
			.setTitle(`${imperativeTenseAction}d`)
			.setColor(colour)
			.addFields(fields)
			.setTimestamp()
			.toJSON();

		await this.sendLog({
			input: options.clazz,
			actionType,
			embeds,
			button
		});
	}

	private static resolveCache(input: unknown): Collection<any, any> {
		if (input instanceof Collection) {
			return input;
		}

		if (input instanceof DataManager) {
			return input.cache;
		}

		throw new TypeError("Unexpected input", { cause: input });
	}

	private static resolveGuild(input: Record<string, any>): Guild {
		if (input instanceof Guild) {
			return input;
		}

		if ("guild" in input && input.guild instanceof Guild) {
			return input.guild;
		}

		throw new TypeError("Unexpected input", { cause: input });
	}

	private static resolveClazzMention<T>(input: T): string | T {
		if (input instanceof CategoryChannel) {
			return `${input} (${input.valueOf()})`;
		}

		if (input instanceof Base && "id" in input && typeof input.id === "string") {
			const isDefaultToString = input.toString === Object.prototype.toString;

			if (isDefaultToString) {
				return input.id;
			}

			return String(input);
		}

		return input;
	}

	private static resolveValidFieldValue(value: unknown): string | null {
		if (typeof value === "string" && !value.length) {
			return null;
		}

		return String(value);
	}

	private static async sendLog(options: SendLogOptions) {
		const { input, actionType, embeds, button } = options;

		const guild = this.resolveGuild(input);

		const record = await DBConnectionManager.Prisma.logChannel.retrieveMatching({
			input: guild,
			actionType,
			eventType: EventType.DISCORD
		});

		if (!record) {
			return null;
		}

		const { doc, save, channel } = record;

		if (!doc) {
			return null;
		}

		const { user: clientUser } = guild.client;

		const webhookUrl = doc.webhookUrl!;

		const sendFn = async () => {
			const webhookClient = new WebhookClient({ url: webhookUrl });

			const components: ActionRowBuilder<ButtonBuilder>[] = [];

			if (button) {
				const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

				components.push(actionRow);
			}

			await webhookClient.send({
				username: clientUser.username,
				avatarURL: clientUser.displayAvatarURL(),
				embeds,
				components
			});
		};

		try {
			await sendFn();
		} catch (err) {
			if (InteractionUtils.isPermissionError(err)) {
				return;
			}

			const isWebhookError =
				err instanceof DiscordAPIError &&
				(err.code === RESTJSONErrorCodes.UnknownWebhook || err.code === RESTJSONErrorCodes.InvalidWebhookToken);

			if (!isWebhookError) {
				throw err;
			}

			const webhook = await ActionManager.generateLogWebhook({ channel, user: clientUser }, channel);

			doc.webhookUrl = webhook.url;

			await save();

			await sendFn().catch(() => null);
		}
	}
}
