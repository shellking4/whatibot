import { IsString } from "class-validator";
import { IsPhoneNumberWithCountryCode } from "./phone-number-validator";


export class WhatsappMessagePayloadDto {

    // must include country code, e.g., 2290162798845
    @IsPhoneNumberWithCountryCode({
        message: 'Veuillez fournir un numéro de téléphone valide avec le code pays (ex: +229 XX XX XX XX)',
    })
    phoneNumber: string;

    @IsString()
    message: string;

}