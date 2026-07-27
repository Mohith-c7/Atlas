import type { FounderAccount, UpdateFounderAccountRequest } from "@faios/contracts";
import type { Prisma, PrismaClient } from "@faios/database";

const founderAccountInclude = {
  profile: true,
  companyProfile: true,
} satisfies Prisma.FounderAccountInclude;

type FounderAccountWithProfile = Prisma.FounderAccountGetPayload<{
  include: typeof founderAccountInclude;
}>;

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function toProfileData(profile: UpdateFounderAccountRequest["profile"]) {
  if (!profile) {
    return undefined;
  }

  return {
    timezone: profile.timezone,
    locale: profile.locale,
    operatingStyle: profile.operatingStyle,
    defaultVoice: profile.defaultVoice,
    approvalSettings: toInputJsonValue(profile.approvalSettings),
  };
}

function toCompanyProfileData(companyProfile: UpdateFounderAccountRequest["companyProfile"]) {
  if (!companyProfile) {
    return undefined;
  }

  return {
    name: companyProfile.name,
    industry: companyProfile.industry,
    stage: companyProfile.stage,
    description: companyProfile.description,
    context: toInputJsonValue(companyProfile.context),
  };
}

function toContract(record: FounderAccountWithProfile): FounderAccount {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    profile: {
      timezone: record.profile?.timezone,
      locale: record.profile?.locale,
      operatingStyle: record.profile?.operatingStyle,
      defaultVoice: record.profile?.defaultVoice,
      approvalSettings: record.profile?.approvalSettings,
    },
    companyProfile: {
      name: record.companyProfile?.name,
      industry: record.companyProfile?.industry,
      stage: record.companyProfile?.stage,
      description: record.companyProfile?.description,
      context: record.companyProfile?.context,
    },
  };
}

export class FounderAccountRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async getById(founderId: string): Promise<FounderAccount | null> {
    const account = await this.database.founderAccount.findUnique({
      where: {
        id: founderId,
      },
      include: founderAccountInclude,
    });

    return account ? toContract(account) : null;
  }

  public async update(
    founderId: string,
    input: UpdateFounderAccountRequest,
  ): Promise<FounderAccount> {
    const profileData = toProfileData(input.profile);
    const companyProfileData = toCompanyProfileData(input.companyProfile);
    await this.database.founderAccount.update({
      where: {
        id: founderId,
      },
      data: {
        displayName: input.displayName,
        profile: profileData
          ? {
              upsert: {
                create: profileData,
                update: profileData,
              },
            }
          : undefined,
        companyProfile: companyProfileData
          ? {
              upsert: {
                create: companyProfileData,
                update: companyProfileData,
              },
            }
          : undefined,
      },
    });

    const account = await this.getById(founderId);

    if (!account) {
      throw new Error("Founder account was not found after update.");
    }

    return account;
  }
}
