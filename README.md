This is a simple NestJS REST API wrapper around the whatsapp web js library, which is a whatsapp automation toolkit.

The project includes a static/index.html file where we use socket.io to get the qr code in realtime.

Here is a way you can get everything working :

Normally when the server starts the whatsapp web authentication should happen automatically. But sometimes it doesn't. So as a rule of thumb you can do these steps:

1- Open the endpoint / in your browser. You should see a starter invalid whatsapp Qr code

2- call the endpoint /whatsapp/init-client with the auth headers (Authorization: 'Basic UqhJeB_rsRlQmKgxl01AYi14lz7z4UNtd_t1EnQn0UEFZiCYERg-AOv1f5EsprVH1iYzKTjzEVSqqQlm0JtQ4ezvlYP6MuL8C6GELj-Duwe_7ghy9qj_z9STAD5LTwGRt5oGzA')

That triggers the whatsapp web authentication and automatically update the Qr Code in the browser at /

3- Scan the Qr Code to authenticate to your account

4- Now you can start calling the endpoint /whatsapp/send-message with the auth headers (Authorization: 'Basic UqhJeB_rsRlQmKgxl01AYi14lz7z4UNtd_t1EnQn0UEFZiCYERg-AOv1f5EsprVH1iYzKTjzEVSqqQlm0JtQ4ezvlYP6MuL8C6GELj-Duwe_7ghy9qj_z9STAD5LTwGRt5oGzA')and the payload shape below:

{ 
  "phoneNumber": "51478954"
  "message": "Hello from 51478954"
}

It is possible that the whatsapp web auth credentials which are stored in .wwebjs_auth get corrupted overtime, in which case you need to do the authentication process again(ie. steps 1, 2, 3)


