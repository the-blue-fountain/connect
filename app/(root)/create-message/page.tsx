import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import PostMessage from "@/components/forms/PostMessage";
import { fetchUser } from "@/lib/actions/user.actions";

async function Page() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  // fetch organization list created by user
  const userInfo = await fetchUser(user.id);
  if (!userInfo?.onboarded) redirect("/onboarding");

  return (
    <>
      <h1 className='head-text'>Create Message</h1>

      <PostMessage userId={userInfo._id} />
    </>
  );
}

export default Page;
