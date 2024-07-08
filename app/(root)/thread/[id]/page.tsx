import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";

import Comment from "@/components/forms/Comment";
import MessageCard from "@/components/cards/MessageCard";

import { fetchUser } from "@/lib/actions/user.actions";
import { fetchMessageById } from "@/lib/actions/message.actions";

export const revalidate = 0;

async function page({ params }: { params: { id: string } }) {
  if (!params.id) return null;

  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const userInfo = await fetchUser(user.id);
  if (!userInfo?.onboarded) redirect("/onboarding");

  const message = await fetchMessageById(params.id);

  return (
    <section className='relative'>
      <div>
        <MessageCard
          id={message._id}
          currentUserId={user.id}
          parentId={message.parentId}
          content={message.text}
          author={message.author}
          community={message.community}
          createdAt={message.createdAt}
          comments={message.children}
        />
      </div>

      <div className='mt-7'>
        <Comment
          messageId={params.id}
          currentUserImg={user.imageUrl}
          currentUserId={JSON.stringify(userInfo._id)}
        />
      </div>

      <div className='mt-10'>
        {message.children.map((childItem: any) => (
          <MessageCard
            key={childItem._id}
            id={childItem._id}
            currentUserId={user.id}
            parentId={childItem.parentId}
            content={childItem.text}
            author={childItem.author}
            community={childItem.community}
            createdAt={childItem.createdAt}
            comments={childItem.children}
            isComment
          />
        ))}
      </div>
    </section>
  );
}

export default page;
