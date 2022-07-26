import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";

import TriggerPunishment from "./Triggers.Punishment";

export default class TriggerMain
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Trigger.Main
{
  @prop({ type: String })
  public ignoredRoles?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public ignoredChannels?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public ignoredUsers?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public targetedRoles?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public targetedChannels?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public targetedUsers?: mongoose.Types.Array<string>;

  @prop({
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: `{VALUE} is not an integer value`,
    },
  })
  public warnThreshold?: number;

  @prop({ type: TriggerPunishment })
  public punishment?: TriggerPunishment;
}
