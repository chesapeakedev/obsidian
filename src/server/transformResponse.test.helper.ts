// need redis v0.23.2 to be compatible with Deno testing. That is why we need to separate transformResponseLight.ts from transformResponse.ts

import {
  containsHashableObject,
  hashMaker,
  isHashableObject,
} from "../../src/server/normalize.ts";
import { GenericObject } from "../../src/server/normalize.ts";
import { Cache } from "./cache/quickCache.test.helper.ts";
const cache = new Cache();

const isArrayOfHashableObjects = (
  arrayOfObjects: Array<GenericObject>,
  hashableKeys: Array<string>,
): boolean => {
  if (Array.isArray(arrayOfObjects)) {
    return arrayOfObjects.every((object) => {
      return containsHashableObject(object, hashableKeys);
    });
  }
  return false;
};

/* ----------------------------------------------------------------*/
/** transformResponse
 * Returns a nested object representing an object of references, where the references are hashes in Redis. The responseObject input must:
 * 1) Contain hashable object(s)
 * 2) have a first key of 'data', as should all GraphQL response objects
 * 3) have an inner array of data response objects corresponding to the GraphQL fields
 *
 * @param {GenericObject} responseObject GraphQL response Object for large read query
 * @param {array} hashableKeys Array of hashable keys
 * @return {GenericObject} Nested object representing an object of references, where the references are hashes in Redis
 */
export const transformResponse = (
  responseObject: GenericObject,
  hashableKeys: Array<string>,
): GenericObject => {
  const result: GenericObject = {};

  if (responseObject.data) {
    const data = responseObject.data as GenericObject;
    return transformResponse(data, hashableKeys);
  } else if (isHashableObject(responseObject, hashableKeys)) {
    return result;
  } else {
    for (const key in responseObject) {
      const value = responseObject[key];
      if (
        Array.isArray(value) && isArrayOfHashableObjects(value, hashableKeys)
      ) {
        for (const element of value) {
          const hash = hashMaker(element, hashableKeys);
          result[hash] = transformResponse(element, hashableKeys);
        }
      }
    }
  }
  return result;
};

/* ----------------------------------------------------------------*/
/** detransformResponse
 * Returns a nested object representing the original graphQL response object for a given queryKey
 * @param {String} queryKey String representing the stringified GraphQL query for a big read query, which should have been saved as a key in Redis
 * @param {GenericObject} transformedValue Nested object representing of references, where the references are hashes in Redis
 * @return {GenericObject} Nested object representing the original graphQL response object for a given queryKey
 */
export const detransformResponse = async (
  queryKey: string,
  transformedValue: GenericObject,
): Promise<GenericObject> => {
  // remove all text within parentheses aka '(input: ...)'
  queryKey = queryKey.replace(/\(([^)]+)\)/, "");
  // save Regex matches for line break followed by '{'
  const matches = [...queryKey.matchAll(/\n([^\n]+)\{/g)];

  // get fields of query
  const fields: Array<string> = [];
  matches.forEach((match) => {
    fields.push(match[1].trim());
  });
  const recursiveDetransform = async (
    transformedValue: GenericObject,
    fields: Array<string>,
    depth: number = 0,
  ): Promise<GenericObject> => {
    const result: GenericObject = {};
    const currDepth = depth;

    console.log("tv-> ", transformedValue);
    // base case: innermost object with key:value pair of hash:{}
    if (Object.keys(transformedValue).length === 0) {
      return result;
    } else {
      const currField: string = fields[currDepth];
      result[currField] = [] as GenericObject[];

      for (const hash in transformedValue) {
        console.log("hash -> ", hash);
        const redisValue = await cache.cacheReadObject(hash) as GenericObject;
        console.log("redisVal -> ", redisValue);
        // edge case in which our eviction strategy has pushed partial Cache data out of Redis
        if (!redisValue) {
          return { "cache evicted": {} };
        }

        const fieldArray = result[currField] as GenericObject[];
        fieldArray.push(redisValue);

        fieldArray[fieldArray.length - 1] = Object.assign(
          fieldArray[fieldArray.length - 1],
          await recursiveDetransform(
            transformedValue[hash] as GenericObject,
            fields,
            depth = currDepth + 1,
          ),
        );
      }
      return result;
    }
  };
  const detransformedResult: GenericObject = { "data": {} };
  detransformedResult.data = await recursiveDetransform(
    transformedValue,
    fields,
  );
  console.log("dt-> ", detransformedResult);
  return detransformedResult;
};
