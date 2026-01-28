/** @format */

// Normalizes responses using the query object from destructure and the response object from
// the graphql request
export default function normalizeResult(
  queryObj: Record<string, unknown>,
  resultObj: Record<string, unknown>,
  deleteFlag?: boolean,
): Record<string, unknown> {
  // Object to hold normalized obj
  const result: Record<string, unknown> = {};
  // checks if there is a delete mutation
  if (deleteFlag) {
    //creates the ROOT_MUTATION hash that is being deleted
    result["ROOT_MUTATION"] = createRootQuery(
      queryObj.mutations as unknown[],
      resultObj,
      deleteFlag,
    );

    //iterate thru the different response objects that were mutated
    const obj = resultObj.data;
    //checks if the current element is an array
    if (Array.isArray(obj)) {
      //iterates thru the array of objects and stores the hash in the result object with 'DELETE' as value
      obj.forEach((ele: Record<string, unknown>) => {
        const mutationKeys = Object.keys(ele);
        const hash = labelId(ele[mutationKeys[0]] as Record<string, unknown>);
        result[hash] = "DELETED";
      });
    } else if (obj && typeof obj === "object") {
      //else stores the hash in the result object with the value 'DELETE'
      const objRecord = obj as Record<string, unknown>;
      const mutationKeys = Object.keys(objRecord);
      const hash = labelId(
        objRecord[mutationKeys[0]] as Record<string, unknown>,
      );
      result[hash] = "DELETED";
    }
  } // creates a stringified version of query request and stores it in ROOT_QUERY key
  else if (queryObj.queries || queryObj.mutations) {
    if (queryObj.queries) {
      result["ROOT_QUERY"] = createRootQuery(
        queryObj.queries as unknown[],
        resultObj,
      );
    } else {
      result["ROOT_MUTATION"] = createRootQuery(
        queryObj.mutations as unknown[],
        resultObj,
      );
    }
    const data = resultObj.data as Record<string, unknown>;
    for (const curr in data) {
      if (!Array.isArray(data[curr])) {
        const hashObj = createHash(data[curr] as Record<string, unknown>);
        for (const hash in hashObj) {
          if (result[hash]) {
            Object.assign(
              result[hash] as Record<string, unknown>,
              hashObj[hash],
            );
          } else {
            result[hash] = hashObj[hash];
          }
        }
      } else {
        const currArray = data[curr] as unknown[];
        for (let i = 0; i < currArray.length; i++) {
          // pass current obj to createHash function to create  obj of hashes
          const hashObj = createHash(currArray[i] as Record<string, unknown>);
          // check if the hash object pair exists, if not create new key value pair
          // if it does exist merge the hash pair with the existing key value pair
          for (const hash in hashObj) {
            if (result[hash]) {
              Object.assign(
                result[hash] as Record<string, unknown>,
                hashObj[hash],
              );
            } else {
              result[hash] = hashObj[hash];
            }
          }
        }
      }
    }
  }
  return result;
}

// creates the hashes for query requests and stores the reference hash that will be stored in result
function createRootQuery(
  queryObjArr: unknown[],
  resultObj: Record<string, unknown>,
  _deleteFlag?: boolean,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  queryObjArr.forEach((query) => {
    const queryRecord = query as Record<string, unknown>;
    // if query has an alias declare it
    const alias = queryRecord.alias as string | null;
    const name = queryRecord.name as string;
    const args = queryRecord.arguments as string;
    const queryHash = name + args;
    const data = resultObj.data as Record<string, unknown>;
    const result = data[alias ?? ""] ?? data[name];
    // iterate thru the array of current query response
    // and store the hash of that response in an array

    if (Array.isArray(result)) {
      const arrOfHashes: string[] = [];
      result.forEach((obj: Record<string, unknown>) => {
        arrOfHashes.push(labelId(obj));
      });

      //store the array of hashes associated with the queryHash
      output[queryHash] = arrOfHashes;
    } else {
      output[queryHash] = [labelId(result as Record<string, unknown>)];
    }
  });
  return output;
}

//returns a hash value pair of each response obj passed in
function createHash(
  obj: Record<string, unknown>,
  output: Record<string, unknown> = {},
): Record<string, unknown> {
  const hash = labelId(obj);
  //if output doesnt have a key of hash create a new obj with that hash key
  if (!output[hash]) output[hash] = {};
  // iterate thru the fields in the current obj and check whether the current field
  // is __typename, if so continue to the next iteration
  for (const field in obj) {
    if (field === "__typename") continue;
    //check whether current field is not an array
    if (!Array.isArray(obj[field])) {
      //check whether current field is an object
      if (typeof obj[field] === "object" && obj[field] !== null) {
        const fieldObj = obj[field] as Record<string, unknown>;
        const hashObj = output[hash] as Record<string, unknown>;
        hashObj[field] = labelId(fieldObj);
        output = createHash(fieldObj, output);
      } else {
        const hashObj = output[hash] as Record<string, unknown>;
        hashObj[field] = obj[field];
      }
    } // if it's an array of objects, iterate thru the array
    // create a hash for each obj in the array and store it in an array
    // recursive call on the current obj in the array
    // store the output of the recursive call in output
    else {
      const hashObj = output[hash] as Record<string, unknown>;
      hashObj[field] = [];
      (obj[field] as Record<string, unknown>[]).forEach(
        (obj: Record<string, unknown>) => {
          const arrayHash = labelId(obj);
          (hashObj[field] as string[]).push(arrayHash);
          output = createHash(obj, output);
        },
      );
      // store hashed values in output
    }
  }
  return output;
}

function labelId(obj: Record<string, unknown>): string {
  const id =
    (obj.id || obj.ID || obj._id || obj._ID || obj.Id || obj._Id) as string;
  return (obj.__typename as string) + "~" + id;
}
