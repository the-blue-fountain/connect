"use server";

import { revalidatePath } from "next/cache";

import { connectToDB } from "../mongoose";

import User from "../models/user.model";
import Message from "../models/message.model";
import Community from "../models/community.model";

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB();

  // Calculate the number of posts to skip based on the page number and page size.
  const skipAmount = (pageNumber - 1) * pageSize;

  // Create a query to fetch the posts that have no parent (top-level Messages) (a message that is not a comment/reply).
  const postsQuery = Message.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({
      path: "author",
      model: User,
    })
    .populate({
      path: "community",
      model: Community,
    })
    .populate({
      path: "children", // Populate the children field
      populate: {
        path: "author", // Populate the author field within children
        model: User,
        select: "_id name parentId image", // Select only _id and username fields of the author
      },
    });

  // Count the total number of top-level posts (Messages) i.e., Messages that are not comments.
  const totalPostsCount = await Message.countDocuments({
    parentId: { $in: [null, undefined] },
  }); // Get the total count of posts

  const posts = await postsQuery.exec();

  const isNext = totalPostsCount > skipAmount + posts.length;

  return { posts, isNext };
}

interface Params {
  text: string,
  author: string,
  communityId: string | null,
  path: string,
}

export async function createMessage({ text, author, communityId, path }: Params
) {
  try {
    connectToDB();

    const communityIdObject = await Community.findOne(
      { id: communityId },
      { _id: 1 }
    );

    const createdMessage = await Message.create({
      text,
      author,
      community: communityIdObject, // Assign communityId if provided, or leave it null for personal account
    });

    // Update User model
    await User.findByIdAndUpdate(author, {
      $push: { Messages: createdMessage._id },
    });

    if (communityIdObject) {
      // Update Community model
      await Community.findByIdAndUpdate(communityIdObject, {
        $push: { Messages: createdMessage._id },
      });
    }

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to create message: ${error.message}`);
  }
}

async function fetchAllChildMessages(messageId: string): Promise<any[]> {
  const childMessages = await Message.find({ parentId: messageId });

  const descendantMessages = [];
  for (const childMessage of childMessages) {
    const descendants = await fetchAllChildMessages(childMessage._id);
    descendantMessages.push(childMessage, ...descendants);
  }

  return descendantMessages;
}

export async function deleteMessage(id: string, path: string): Promise<void> {
  try {
    connectToDB();

    // Find the message to be deleted (the main message)
    const mainMessage = await Message.findById(id).populate("author community");

    if (!mainMessage) {
      throw new Error("Message not found");
    }

    // Fetch all child Messages and their descendants recursively
    const descendantMessages = await fetchAllChildMessages(id);

    // Get all descendant message IDs including the main message ID and child message IDs
    const descendantMessageIds = [
      id,
      ...descendantMessages.map((message) => message._id),
    ];

    // Extract the authorIds and communityIds to update User and Community models respectively
    const uniqueAuthorIds = new Set(
      [
        ...descendantMessages.map((message) => message.author?._id?.toString()), // Use optional chaining to handle possible undefined values
        mainMessage.author?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    const uniqueCommunityIds = new Set(
      [
        ...descendantMessages.map((message) => message.community?._id?.toString()), // Use optional chaining to handle possible undefined values
        mainMessage.community?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    // Recursively delete child Messages and their descendants
    await Message.deleteMany({ _id: { $in: descendantMessageIds } });

    // Update User model
    await User.updateMany(
      { _id: { $in: Array.from(uniqueAuthorIds) } },
      { $pull: { Messages: { $in: descendantMessageIds } } }
    );

    // Update Community model
    await Community.updateMany(
      { _id: { $in: Array.from(uniqueCommunityIds) } },
      { $pull: { Messages: { $in: descendantMessageIds } } }
    );

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to delete message: ${error.message}`);
  }
}

export async function fetchMessageById(messageId: string) {
  connectToDB();

  try {
    const message = await Message.findById(messageId)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      }) // Populate the author field with _id and username
      .populate({
        path: "community",
        model: Community,
        select: "_id id name image",
      }) // Populate the community field with _id and name
      .populate({
        path: "children", // Populate the children field
        populate: [
          {
            path: "author", // Populate the author field within children
            model: User,
            select: "_id id name parentId image", // Select only _id and username fields of the author
          },
          {
            path: "children", // Populate the children field within children
            model: Message, // The model of the nested children (assuming it's the same "Message" model)
            populate: {
              path: "author", // Populate the author field within nested children
              model: User,
              select: "_id id name parentId image", // Select only _id and username fields of the author
            },
          },
        ],
      })
      .exec();

    return message;
  } catch (err) {
    console.error("Error while fetching message:", err);
    throw new Error("Unable to fetch message");
  }
}

export async function addCommentToMessage(
  messageId: string,
  commentText: string,
  userId: string,
  path: string
) {
  connectToDB();

  try {
    // Find the original message by its ID
    const originalMessage = await Message.findById(messageId);

    if (!originalMessage) {
      throw new Error("Message not found");
    }

    // Create the new comment message
    const commentMessage = new Message({
      text: commentText,
      author: userId,
      parentId: messageId, // Set the parentId to the original message's ID
    });

    // Save the comment message to the database
    const savedCommentMessage = await commentMessage.save();

    // Add the comment message's ID to the original message's children array
    originalMessage.children.push(savedCommentMessage._id);

    // Save the updated original message to the database
    await originalMessage.save();

    revalidatePath(path);
  } catch (err) {
    console.error("Error while adding comment:", err);
    throw new Error("Unable to add comment");
  }
}
