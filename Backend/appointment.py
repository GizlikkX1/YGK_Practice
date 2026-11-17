from dataclasses import dataclass
from datetime import datetime


@dataclass
class Master:
    master_id: int


@dataclass
class Service:
    service_id: int


class Appoinment:
    """Запись клиента в салон."""

    def __init__(
        self,
        appointment_id: int,
        client_name: str,
        master_id: int,
        service_id: int,
        time: str,
    ):
        self.id = appointment_id
        self.client_name = client_name
        self.master_id = master_id
        self.service_id = service_id
        self.time = time


# Демонстрационные данные. В существующем проекте используйте его
# готовые функции get_master() и get_service() вместо этих реализаций.
masters = {
    1: Master(master_id=1),
    2: Master(master_id=2),
}

services = {
    1: Service(service_id=1),
    2: Service(service_id=2),
}


def get_master(master_id: int):
    return masters.get(master_id)


def get_service(service_id: int):
    return services.get(service_id)


appointments: list[Appoinment] = []


def is_valid_working_time(time: str) -> bool:
    """Проверяет формат HH:MM и время работы салона (08:00–20:00)."""
    try:
        parsed_time = datetime.strptime(time, "%H:%M").time()
    except (TypeError, ValueError):
        return False

    return datetime.strptime("08:00", "%H:%M").time() <= parsed_time <= datetime.strptime(
        "20:00", "%H:%M"
    ).time()


def create_appointment(
    client_name: str,
    master_id: int,
    service_id: int,
    time: str,
) -> Appoinment | None:
    """Создаёт запись, только если все поля корректны."""
    if not isinstance(client_name, str) or not client_name.strip():
        return None

    if not isinstance(master_id, int) or not isinstance(service_id, int):
        return None

    if not isinstance(time, str) or not is_valid_working_time(time):
        return None

    master = get_master(master_id)
    service = get_service(service_id)

    if master is None or service is None:
        return None

    appointment = Appoinment(
        appointment_id=len(appointments) + 1,
        client_name=client_name.strip(),
        master_id=master.master_id,
        service_id=service.service_id,
        time=time,
    )
    appointments.append(appointment)
    return appointment


if __name__ == "__main__":
    first_appointment = create_appointment("Иванова А.А.", 1, 1, "10:00")
    second_appointment = create_appointment("Петрова А.А.", 1, 1, "11:00")

    print("Список записей:")
    for appointment in appointments:
        print(appointment.client_name, appointment.time)

    # Некорректное время не добавляет запись.
    before = len(appointments)
    no_correct_appointment = create_appointment("Сидорова А.А.", 1, 1, "00:00")
    print("Некорректная запись:", no_correct_appointment)
    print("Количество записей не изменилось:", len(appointments) == before)
