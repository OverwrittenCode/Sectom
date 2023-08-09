import { type ArgsOf, Client, Discord, On } from "discordx";

@Discord()
class Example {
	@On({ event: "messageCreate" })
	onMessage(
		[message]: ArgsOf<"messageCreate">, // Type message automatically
		client: Client, // Client instance injected here,
		guardPayload: any
	) {
		// ...
	}
}
