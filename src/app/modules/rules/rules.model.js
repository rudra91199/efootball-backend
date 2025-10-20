import { model, Schema } from "mongoose";

// Schema for a single point to note
const PointToNoteSchema = new Schema({
  content: { type: String },
});

// Schema for a single rule
const RuleSchema = new Schema({
  content: { type: String, required: true },
});

// Schema for a sub-category
const SubCategorySchema = new Schema({
  name: { type: String, required: true },
  rules: [RuleSchema],
  pointsToNote: [PointToNoteSchema],
});

// Schema for a category
const CategorySchema = new Schema({
  name: { type: String, required: true },
  subCategories: [SubCategorySchema],
});

// The main schema that holds the entire array of categories.
// We will treat this as a "singleton" document in our collection.
const RulesConfigurationSchema = new Schema(
  {
    // We can add an identifier if we ever want more than one ruleset.
    // For now, we will just find the single document in the collection.
    categories: [CategorySchema],
  },
  { timestamps: true } // Adds createdAt and updatedAt timestamps
);

// We remove the frontend-specific 'id' fields upon saving. MongoDB's '_id' will be the source of truth.
// Note: Mongoose does not save empty objects in arrays by default, which is good.
export const RulesConfiguration = model(
  "RulesConfiguration",
  RulesConfigurationSchema
);
