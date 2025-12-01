import { IsString } from "class-validator";
import { IsPhoneNumberWithCountryCode } from "./phone-number-validator";


export class WhatsappMessagePayloadDto {

    // must include country code, eg: +2290162798845
    @IsPhoneNumberWithCountryCode({
        message: 'Veuillez fournir un numéro de téléphone valide avec le code pays (ex: +2290162798845 / +229 01 62 79 88 45)',
    })
    phoneNumber: string;

    @IsString()
    message: string;

}