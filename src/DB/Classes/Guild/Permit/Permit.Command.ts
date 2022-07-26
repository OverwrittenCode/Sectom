import { prop } from "@typegoose/typegoose";
import { Namespaces } from "@DB/index";

export default class GuildPermitCommand
  extends Namespaces.Classes.Base.Access.Gate
  implements Namespaces.Interfaces.Guild.Permit.Command
{
  @prop()
  public name: string;
}
