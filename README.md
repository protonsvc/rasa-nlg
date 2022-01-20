## NLG Server
An external NLG Server useful for externalizing and managing responses for Rasa powered AI Assistants.

Rasa Open Source can be configured to [outsource the response generation](https://rasa.com/docs/rasa/nlg/). This can be useful during the initial design and development phases of your AI assistant.

> **_NOTE:_**  This is a work in progress. We have a list of features that we want to build in addition to dealing with bug fixes.

### Features
* Self hosted UI to manage the channel specific responses of your Rasa AI assistant
* Multi-bot support: multiple Rasa AI assistants can be served by a single instance


### Installation
As of now, you need docker/k8s to run the NLG server. The server is exposed on port `9080`. Run the following docker command to start the server:

```
docker run -d -p 9080:9080 protonsvc/nlg-server:0.2
```

Open the UI in your browser to register your AI assistant and upload/create its responses.

### Configure Rasa
Make sure to note down the `ID` of the assistant the you registered in the NLG Server. Now edit the `endpoints.yml` file of your Rasa AI assistant and configure the external NLG Server. Here's an example configuration for an assistant with ID=`Bot-1`:

```
nlg:
  url: http://localhost:9080/nlg/bots/Bot-1
```

### Development
* Install [Deno]()
* Configure your IDE to use Deno runtime. We recommend using Visual Studio Code
* Run `nlg.ts` to start the NLG server
