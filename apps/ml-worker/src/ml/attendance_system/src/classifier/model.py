import torch
import torch.nn as nn


class AttendanceClassifier(nn.Module):
    """
    Face Attendance Classifier

    Input:
        512D MobileFaceNet embedding

    Output:
        num_students logits

    Architecture:

        512
         ↓
        128
         ↓
    num_students
    """

    def __init__(
        self,
        num_classes
    ):
        super().__init__()

        self.num_classes = (
            num_classes
        )

        self.fc1 = nn.Linear(
            512,
            128
        )

        self.relu = nn.ReLU()

        self.fc2 = nn.Linear(
            128,
            self.num_classes
        )

    def forward(
        self,
        x
    ):

        x = self.fc1(x)

        x = self.relu(x)

        x = self.fc2(x)

        return x

    def get_num_classes(
        self
    ):

        return self.num_classes


def create_model(num_classes):
    """
    Factory function.

    Args:
        num_classes: Number of students/output classes

    Returns:
        AttendanceClassifier instance
    """

    return AttendanceClassifier(
        num_classes=num_classes
    )
