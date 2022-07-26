import { prop } from "@typegoose/typegoose";

import { Namespaces } from "@DB/index";
import GuildEventsLogging from "./Events.Logging";

export default class GuildEventsMain
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.Events.Main
{
  @prop({ type: GuildEventsLogging })
  public events?: GuildEventsLogging;
}
