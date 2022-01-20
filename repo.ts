import { DB } from "https://deno.land/x/sqlite@v3.1.1/mod.ts";
import { parse } from "https://deno.land/std@0.122.0/encoding/yaml.ts";
import { ResultError } from "./result-error.ts";


// TODO: Allow configuration of the DB file--helps to move to PVC on K8S.
const db = new DB("nlg.db");

const toDateTimeString = (utcTimestamp: number): string => {
  const date = new Date(utcTimestamp);
  let str = (date.getUTCMonth() + 1) + "/" + date.getUTCDate() + "/" + date.getUTCFullYear();
  str += " " + date.getUTCHours() + ":" + date.getUTCMinutes() + ":" + date.getUTCSeconds();

  return str;
};

db.query(`
  CREATE TABLE IF NOT EXISTS bots (
    bot_id TEXT NOT NULL,
    name TEXT NOT NULL, 
    description TEXT,
    rasa_version TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    PRIMARY KEY (bot_id)
  )
`);

// TODO: This deno driver needs to support JSON if we make "data" column as JSON.
db.query(`
  CREATE TABLE IF NOT EXISTS responses (
    bot_id TEXT NOT NULL,
    resp_id TEXT NOT NULL, 
    data TEXT NOT NULL,
    last_modified INTEGER NOT NULL,
    PRIMARY KEY (bot_id, resp_id)
  )
`);

export class Bots {
  upsert(botId: string, data: Record<string, any>): object {
    // TODO: Add validation.
    db.query(
      "INSERT OR REPLACE INTO bots (bot_id, name, description, rasa_version, last_modified) VALUES (?, ?, ?, ?, ?)",
      [botId, data.name, data.description, data.rasaVersion, new Date().getTime()]
    );

    return {
      "message": `Bot '${botId}'' upserted`
    }
  }

  list(): object {
    const query = db.query<[string, string, string, string, number]>(
      "SELECT bot_id, name, description, rasa_version, last_modified FROM bots"
    );
    const items = [];

    for (const [botId, name, description, rasaVersion, updatedOn] of query) {
      items.push({
        "id": botId,
        "name": name,
        "description": description,
        "rasaVersion": rasaVersion,
        "updatedOn": toDateTimeString(updatedOn)
      });
    }

    return {
      "items": items
    };
  }

  remove(botId: string): object {
    // TODO: Add validation.
    db.query(
      "DELETE FROM responses WHERE bot_id = ?",
      [botId]
    );

    db.query(
      "DELETE FROM bots WHERE bot_id = ?",
      [botId]
    );

    return {
      "message": `Bot '${botId}'' deleted`
    }
  }

  get(botId: string): Record<string, any> {
    const query = db.query<[string, string, string, number]>(
      "SELECT name, description, rasa_version, last_modified FROM bots WHERE bot_id = ?",
      [botId]
    );

    const responses: Record<string, any> = [];

    // TODO: Add validation
    for (const [name, description, rasaVersion, updatedOn] of query) {
      const result = {
        "id": botId,
        "name": name,
        "description": description,
        "rasaVersion": rasaVersion,
        "updatedOn": toDateTimeString(updatedOn),
        "responses": responses
      }; 

      const query = db.query<[string, string, number]>(
        "SELECT resp_id, data, last_modified FROM responses WHERE bot_id = ?",
        [botId]
      );
  
      // TODO: Add validation
      for (const [respId, data, updatedOn] of query) {
        const fullData = {
          id: respId,
          data: JSON.parse(data),
          updatedOn: toDateTimeString(updatedOn)
        };
        responses.push(fullData);
      }

      return result;
    }

    throw new ResultError(404, `No bot found '${botId}'`);
  }

  close(): void {
    // Close connection
    db.close();
  }
}

export class Responses {

  async load(botId: string, file: File): Promise<object> {
    // TODO: Add validation.
    const yaml = await file.text();
    const rawData = parse(yaml) as Record<string, any>;
    const responses = rawData["responses"];

    for (const respId in responses) {
      const data = responses[respId];
      this.upsert(botId, respId, data) 
    }
    
    return Promise.resolve({
      "message": `Responses upserted`
    });
  }

  upsert(botId: string, respId: string, data: object): object {
    // TODO: Add validation.
    db.query(
      "INSERT OR REPLACE INTO responses (bot_id, resp_id, data, last_modified) VALUES (?, ?, ?, ?)",
      [botId, respId, JSON.stringify(data), new Date().getTime()]
    );

    return {
      "message": `Response '${respId}'' upserted`
    }
  }

  remove(botId: string, respId: string): object {
    // TODO: Add validation.
    db.query(
      "DELETE FROM responses WHERE bot_id = ? AND resp_id = ?",
      [botId, respId]
    );

    return {
      "message": `Response '${respId}'' deleted`
    }
  }

  get(botId: string, respId: string): object {
    const query = db.query<[string, string, number]>(
      "SELECT resp_id, data, last_modified FROM responses WHERE bot_id = ? AND resp_id = ?",
      [botId, respId]
    );

    // TODO: Add validation
    for (const [respId, data, updatedOn] of query) {
      const fullData = {
        id: respId,
        data: JSON.parse(data),
        updatedOn: toDateTimeString(updatedOn)
      };
      return fullData;
    }

    throw new ResultError(404, `No reponse found for '${respId}'`);
  }

  close(): void {
    // Close connection
    db.close();
  }
}
