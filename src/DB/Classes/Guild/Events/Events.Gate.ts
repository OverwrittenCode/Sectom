import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";

export default class GuildEventsGate
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Guild.Events.Gate
{
  @prop({ type: String })
  public ignoredRoles?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public ignoredChannels?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public ignoredUsers?: mongoose.Types.Array<string>;

  @prop()
  public identifier?: string;
}
