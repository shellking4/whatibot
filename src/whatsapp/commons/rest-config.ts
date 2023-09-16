const PocketBase = require('pocketbase/cjs');

export const pocketbaseServerUrl = "https://drofishop-api.hop.sh"

export const pocketbase = new PocketBase(pocketbaseServerUrl)