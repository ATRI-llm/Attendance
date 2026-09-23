import prisma from "../../database/prisma";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;

export const loginUser = async (identifier: string, password: string) => {
    console.log("Before DB query");

    const users = await prisma.user.findMany({
        where: {
            OR: [
                { userCode: identifier },
                { mobileNumber: identifier },
            ],
        },
        take: 2,
    });

    if (users.length === 0) {
        throw new Error("User not found");
    }

    if (users.length > 1) {
        throw new Error("Multiple accounts match this identifier; use your user code");
    }

    const user = users[0];

    console.log("After DB query");
    console.log("Before bcrypt");


    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        throw new Error("Invalid Password");
    }

    console.log("After bcrypt");

    const token = jwt.sign(
        {
            userId: user.id,
            role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );

    return {
        token,
        user: {
            id: user.id,
            userCode: user.userCode,
            role: user.role
        }
    }
}


export const getMeService = async (userId: string) => {
    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            userCode: true,
            role: true,
            firstName: true,
            lastName: true,
            mobileNumber: true,
        },
    });
};