import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const companyUsers = await prisma.companyUser.findMany({
      where: { userId: user.id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            _count: { select: { transactions: true, employees: true, categories: true } },
          },
        },
      },
    });

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      companyUsers: companyUsers.map((cu) => ({
        companyId: cu.companyId,
        companyName: cu.company.name,
        role: cu.role,
        isActive: cu.isActive,
        transactions: cu.company._count.transactions,
        employees: cu.company._count.employees,
        categories: cu.company._count.categories,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
