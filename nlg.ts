import { serve } from "https://deno.land/std@0.122.0/http/server.ts";
import { Bots, Responses } from "./repo.ts";
import { ResultError } from "./result-error.ts";

const nlgPattern = new URLPattern({ pathname: "/nlg/bots/:botId" });
const crudPattern = new URLPattern({ pathname: "/bots/:botId?/:respId*" });
const assetPattern = new URLPattern({ pathname: "/:assetId+(.css|.html|.js|.ico|.png)" });

const bots = new Bots();
const responses = new Responses();

const RESULT_ERROR_404 = new ResultError(404, "Resource not found");
const RESULT_ERROR_405 = new ResultError(405, "Method not allowed");
const RESULT_ERROR_500 = new ResultError(500, "Server error");

const buildResponse = (defaultHeaders: Record<string, any>, json?: string, jsonStatus?: number, error?: ResultError) => {
  if (error) {
    return new Response(error.json(), {
      status: error.code,
      headers: defaultHeaders,
    });
  } else {
    return new Response(json, {
      status: jsonStatus,
      headers: defaultHeaders
    });
  }
}

const getBotHandler = (botId: string, respId: string): string => {
  let result;
  if (!botId) {
    result = bots.list();
  } else {
    if (respId) {
      result = responses.get(botId, respId);
    } else {
      result = bots.get(botId);
    }
  }
  return JSON.stringify(result);
}

const upsertBotHandler = (botId: string, respId: string, data: object): string => {
  const result = (respId && respId.length > 0) ? responses.upsert(botId, respId, data) : bots.upsert(botId, data);
  return JSON.stringify(result);
}

const deleteBotHandler = (botId: string, respId: string): string => {
  const result = (respId && respId.length > 0) ? responses.remove(botId, respId) : bots.remove(botId);
  return JSON.stringify(result);
}

const nlgHandler = (botId: string, nlgReq: Record<string, any>): string => {
  const respId = nlgReq["response"] || nlgReq["template"];
  const rsp: Record<string, any> = responses.get(botId, respId);
  const data = rsp["data"];
  const channelName = nlgReq["channel"]?.name;
  const channelVariations = [];
  const defaultVariations = [];
  for (const variation of data) {
    if (variation.channel === channelName) {
      channelVariations.push(variation);
    } else if (!variation.channel) {
      defaultVariations.push(variation);
    }
  }

  const actualVariations = channelVariations.length > 0 ? channelVariations : defaultVariations;
  const index = Math.floor(Math.random() * actualVariations.length);
  const variationToSend = actualVariations[index];
  // TODO: Extract slots.
  return JSON.stringify(variationToSend);
}

const routeToNLG = async (req: Request, patternMatch: URLPatternResult, defaultHeaders: Record<string, any>): Promise<Response> => {
  const botId = patternMatch.pathname.groups.botId;
  let jsonStatus;
  let json;
  let error;

  switch(req.method) {
    case "POST": {
      const nlgReq = await req.json();
      json = nlgHandler(botId, nlgReq);
      jsonStatus = 200;
      break;
    }
    default:
      error = RESULT_ERROR_405;  
  }

  return Promise.resolve(buildResponse(defaultHeaders, json, jsonStatus, error));
}

const routeToBot = async (req: Request, patternMatch: URLPatternResult, defaultHeaders: Record<string, any>): Promise<Response> => {
  const botId = patternMatch.pathname.groups.botId;
  const respId = patternMatch.pathname.groups.respId;
  let jsonStatus;
  let json;
  let error;

  switch(req.method) {
    case "GET":
      json = getBotHandler(botId, respId);
      jsonStatus = 200;
      break;
    case "PUT": {
      const ct = req.headers.get("Content-Type");
      const boundary = ct?.split(";")[1]?.split("=")[1];
      // See if it is a file upload.
      if (boundary) {
        const data = await req.formData();
        if (data.has("file")) {
          const file = data.get("file") as File;
          json = JSON.stringify(await responses.load(botId, file));

        } else {
          json = JSON.stringify({ "message": "Invalid file or form data" });
          jsonStatus = 400;
        }
      } else {
        const data = await req.json();        
        json = upsertBotHandler(botId, respId, data);
        jsonStatus = 202;        
      }
      break;
    }
    case "DELETE": {
      json = deleteBotHandler(botId, respId);
      jsonStatus = 202;
      break;
    }
    default:
      error = RESULT_ERROR_405;    
  }

  return Promise.resolve(buildResponse(defaultHeaders, json, jsonStatus, error));
}

const routeToAsset = async (req: Request, defaultHeaders: Record<string, any>, patternMatch?: URLPatternResult, ): Promise<Response> => {
  switch(req.method) {
    case "GET": {
      try {
        const asset = patternMatch ? patternMatch.pathname.input : "/index.html";
        const file = await Deno.readFile(`./dist${asset}`);        
        return Promise.resolve(new Response(file, {}));
      } catch (e) {
        console.error(e);
        return Promise.resolve(buildResponse(defaultHeaders, "", 0, RESULT_ERROR_500));
      }
    }
    default:
      return Promise.resolve(buildResponse(defaultHeaders, "", 0, RESULT_ERROR_405));
  }
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    // TODO: Fix CORS security issues.  
    if (origin && origin.startsWith("http://localhost")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, PUT, GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }
  }

  const defaultHeaders = {
    "Content-Type": "application/json; charset=UTF-8",
    "Access-Control-Allow-Origin": origin
  };

  try {
    let match = nlgPattern.exec(req.url);
    if (match) {
      return await routeToNLG(req, match, defaultHeaders);
    }

    match = crudPattern.exec(req.url);
    if (match) {
      return await routeToBot(req, match, defaultHeaders);
    }
  
    match = assetPattern.exec(req.url);
    if (match) {
      return await routeToAsset(req, defaultHeaders, match);
    }

    const pattern = new URLPattern(req.url)
    if (pattern.pathname === "/") {
      return await routeToAsset(req, defaultHeaders);
    }
    
    return Promise.resolve(buildResponse(defaultHeaders, "", 0, RESULT_ERROR_404));

  } catch (e) {
    console.error(e);
    let error;
    if (e instanceof ResultError) {
      error = e;
    } else {
      error = RESULT_ERROR_500;
    }
    
    return Promise.resolve(buildResponse(defaultHeaders, "", 0, error));
  }
};

const port = 9080;
console.log(`NLG server running on port ${port}`);
await serve(handler, { port: port });
