import axios from "axios";
import { readFile } from "fs/promises";
const config = JSON.parse(
  await readFile(new URL("../config/config.json", import.meta.url))
);
const { getOrdersAPIURL } = config;

export const getOrders = async (apitoken, page = 0, size = 1000) => {
  const response = await axios.get(getOrdersAPIURL, {
    headers: {
      "Content-Type": "application/vnd.api+json",
      "X-Auth-Token": apitoken,
    },
    params: {
      "page[number]": page,
      "page[size]": size,
      "filter[orders][state]": "DELIVERY",
      "filter[orders][creationDate][$ge]":
        new Date().getTime() - 10 * 24 * 60 * 60 * 1000,
    },
  });
  return response.data.data;
};

export const sendCode = async (apitoken, id, confirm = false, code) => {
  const response = await axios.post(
    getOrdersAPIURL,
    {
      data: {
        type: "orders",
        id,
        attributes: {
          status: "COMPLETED",
        },
      },
    },
    {
      headers: {
        "Content-Type": "application/vnd.api+json",
        "X-Auth-Token": apitoken,
        "X-Send-Code": true,
        "X-Security-Code": confirm ? code : "",
      },
    }
  );
  return response.data.data;
};
