import { RulesConfiguration } from "./rules.model.js";

const getRules = async () => {
  const rules = await RulesConfiguration.findOne({});
  if (!rules) {
    return { categories: [] };
  }
  return rules;
};

const updateRules = async (payload) => {
  // The filter {} is empty, so it matches the first document it finds.
  const filter = {};
  const update = { categories: payload };
  const options = {
    new: true, // Return the modified document rather than the original
    upsert: true, // Create a new document if one doesn't exist
  };

  const updatedConfig = await RulesConfiguration.findOneAndUpdate(
    filter,
    update,
    options
  );
  return updatedConfig;
};

export const RulesServices = {
  getRules,
  updateRules,
};
