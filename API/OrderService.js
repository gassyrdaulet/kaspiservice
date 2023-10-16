import axios from "axios";
import config from "config";
const { getOrdersAPIURL } = config.get("config");

export const getOrders = async (apitoken, page = 0, size = 1000) => {
  try {
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
  } catch (e) {
    console.log(e.message);
    return [];
  }
};

export const sendCode = async (apitoken, id, confirm = false, code) => {
  try {
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
  } catch (e) {
    console.log(e.message);
    return false;
  }
};
