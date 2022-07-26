import { prop } from "@typegoose/typegoose";
import { Namespaces } from "@DB/index";

export default class TriggerPunishment
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Trigger.Punishment
{
  @prop({
    enum: Namespaces.Enums.Punishment.TriggerGate,
    addNullToEnum: true,
  })
  public type: `${Namespaces.Enums.Punishment.TriggerGate}`;

  @prop()
  public lengthMS?: number;

  @prop({ min: 1 })
  public multiplier?: number;
}
