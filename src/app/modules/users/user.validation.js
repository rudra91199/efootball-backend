import z from "zod";

const userRegistrationValidationSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email is required" }),
    password: z
      .string({ required_error: "Password is required" })
      .min(6, "Password must be at least 6 characters long"),
    role: z
      .enum(["admin", "referee", "player", "captain"], {
        required_error: "Role is required",
      })
      .default("captain"),
      name: z.string({ required_error: "Name is required" }),
      inGameUserName: z.string({ required_error: "In-game username is required" }),
      inGameUserId: z.string({ required_error: "In-game user ID is required" }),
      phone: z.string({ required_error: "Phone number is required" }),
      image: z.string({ required_error: "Image URL is required"}),
      phoneModel:z.string({ required_error: "Phone model is required"})
  }),
});

export const userValidations = {
  userRegistrationValidationSchema,
};